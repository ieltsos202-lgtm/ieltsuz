"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useSpeakingExaminer } from "@/hooks/useSpeakingExaminer";
import { apiPost, apiPostForm, apiPostFormStream, apiPostStream, apiDelete } from "@/lib/api";
import { playLiveTurn, type LiveTurnEval } from "@/lib/speaking/livePlayer";
import { GeminiLiveSession, PcmPlayer, resampleTo16k, pcmChunksToWavBlob } from "@/lib/speaking/liveClient";
import {
  StudioIntro,
  StudioSession,
  StudioReportView,
  StudioLoading,
  StudioUpgrade,
  type StudioEmotion,
  type StudioPhase,
  type StudioMode,
  type StudioTurn,
  type StudioCueCard,
  type StudioReport,
} from "@/components/speaking/LiveExaminerStudio";

const P1_QUESTIONS = 4;
const P3_QUESTIONS = 5;
const GREETING_TIMEOUT_MS = 3500;
const NO_SPEECH_MS = 15000;
// Mirrors SPEAKING_MAX_SESSION_MIN on the server; the server is authoritative
// (it rejects turns past the cap) — this just ends the test cleanly first.
const MAX_SESSION_MS = 20 * 60 * 1000;
const HARSH_STORAGE_KEY = "speaking:harsh";
// How long the mic stays energy-gated after the last examiner audio chunk, so
// the speaker's tail does not read back as the candidate starting to speak.
const MIC_GATE_TAIL_MS = 260;
// While the examiner is speaking we do NOT mute the mic — that made barge-in
// impossible, so the candidate could never cut in or ask for a repeat. Instead
// audio is forwarded only above this multiple of the measured room noise floor:
// residual speaker echo (the browser AEC already attenuates it) stays below the
// bar, a person actually talking clears it easily.
const BARGE_IN_RMS_FACTOR = 3.5;
const BARGE_IN_RMS_FLOOR = 0.02;
// Real IELTS Part 2: exactly one minute to prepare, then up to two minutes of
// uninterrupted speech during which the examiner says nothing at all and only
// times the candidate. Mock exam only — Friendly Chat has no long turn.
const PART2_PREP_SECONDS = 60;
const PART2_TALK_SECONDS = 120;

type ExamPart = 1 | 2 | 3;

function parsePart(v: string | null): ExamPart | null {
  return v === "1" || v === "2" || v === "3" ? (Number(v) as ExamPart) : null;
}

const SILENCE_NUDGES: { text: string; emotion: StudioEmotion }[] = [
  { text: "Hey, I'm waiting. Uxlab qoldingmi? Answer the question.", emotion: "annoyed" },
  { text: "Hello? Can you hear me? Come on, answer the question.", emotion: "thinking" },
  { text: "Silence gets you zero points in IELTS. Jim o'tirma, gapir. Talk to me.", emotion: "annoyed" },
  { text: "Say anything — even one sentence. Just start talking.", emotion: "encouraging" },
  { text: "Are you scrolling Instagram again? Darsingni qil. Answer me.", emotion: "annoyed" },
];

const EXAM_NUDGES: { text: string; emotion: StudioEmotion }[] = [
  { text: "Take your time, but please answer the question.", emotion: "neutral" },
  { text: "Shall I repeat the question? Go ahead whenever you're ready.", emotion: "thinking" },
  { text: "Please say something — silence can't be assessed.", emotion: "encouraging" },
];

const FALLBACK_CUE: StudioCueCard = {
  topic: "Describe a person who has inspired you.",
  bullets: [
    "who this person is",
    "how you know them",
    "what they have done",
    "and explain why they inspire you",
  ],
};

function SpeakingPartnerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { examinerName } = useSpeakingExaminer();
  const partnerName = examinerName || "Adam";

  const [phase, setPhase] = useState<StudioPhase>("intro");
  const [emotion, setEmotion] = useState<StudioEmotion>("neutral");
  const [turns, setTurns] = useState<StudioTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [mode, setMode] = useState<StudioMode>("chat");
  const [examPart, setExamPart] = useState<ExamPart>(1);
  const [onlyPart, setOnlyPart] = useState<ExamPart | null>(null);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [cueCard, setCueCard] = useState<StudioCueCard | null>(null);
  const [prepSeconds, setPrepSeconds] = useState(PART2_PREP_SECONDS);
  const [longTurnSeconds, setLongTurnSeconds] = useState(PART2_TALK_SECONDS);
  // HARSH mode is opt-in per browser session (18+ warning in the intro).
  const [harsh, setHarsh] = useState(false);
  const harshRef = useRef(false);
  // Signed session token from the server (first turn) — echoed on every turn
  // so the 20-minute cap cannot be dodged by lying about the start time.
  const sessionTokenRef = useRef("");
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live mode: mic chunks are dropped until this timestamp (examiner speaking).
  const micGateUntilRef = useRef(0);
  const [report, setReport] = useState<StudioReport | null>(null);

  const firstTurnRef = useRef(true);
  const autoStartedRef = useRef(false);
  const modeRef = useRef<StudioMode>("chat");
  const examPartRef = useRef<ExamPart>(1);
  const onlyPartRef = useRef<ExamPart | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserStreamRef = useRef<MediaStream | null>(null);
  const micHealthyRef = useRef(true);
  const answersInPartRef = useRef(0);
  const afterSpeakRef = useRef<"auto" | "prep" | "finish">("auto");
  const userBlobsRef = useRef<Blob[]>([]);
  // Measured speaking seconds per answer; the report turns these into wpm.
  const turnDurationsRef = useRef<number[]>([]);
  const recordLimitRef = useRef(89);
  const silenceMsRef = useRef(1000);
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partStartRef = useRef(Date.now());
  const cueCardRef = useRef<StudioCueCard | null>(null);
  const turnsRef = useRef<StudioTurn[]>([]);
  const startPrepRef = useRef<() => void>(() => {});
  const generateReportRef = useRef<() => void>(() => {});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const discardRef = useRef(false);
  const listenStartRef = useRef(0);
  const startRecordingRef = useRef<() => void>(() => {});
  const silenceStrikesRef = useRef(0);
  const pendingAudioRef = useRef<HTMLAudioElement | null>(null);
  const memorySyncedRef = useRef(false);
  const aliveRef = useRef(true);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  // --- Gemini Live API session state ---
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const livePlayerRef = useRef<PcmPlayer | null>(null);
  const liveMicRef = useRef<{
    ctx: AudioContext;
    node: AudioWorkletNode;
    source: MediaStreamAudioSourceNode;
  } | null>(null);
  const [isLive, setIsLive] = useState(false);
  const isLiveRef = useRef(false);
  const liveFailedRef = useRef(false);
  const liveChargedRef = useRef(false);
  const liveFinishRef = useRef(false);
  const prepActiveRef = useRef(false);
  const pendingUserRef = useRef("");
  const pendingPartnerRef = useRef("");
  const userTurnOpenRef = useRef(false);
  const partnerTurnOpenRef = useRef(false);
  const userSpeakStartRef = useRef(0);
  const micLevelAtRef = useRef(0);
  // The model stops generating well before its audio finishes playing; this
  // holds the "examiner is still talking" state until the queue actually drains.
  const liveDrainPendingRef = useRef(false);
  // Handle that lets a fresh socket continue the same conversation, plus a
  // bounded retry count so a genuinely dead session still falls back instead of
  // reconnecting forever.
  const liveResumeRef = useRef("");
  const liveReconnectsRef = useRef(0);
  const liveResumingRef = useRef(false);
  // Forward refs: a dropped session calls resumeLive, which calls back into
  // startLiveSession — the two are mutually recursive.
  const startLiveSessionRef = useRef<
    (m: StudioMode, part: ExamPart, resumeHandle?: string) => Promise<void>
  >(async () => {});
  const resumeLiveRef = useRef<(handle?: string) => Promise<void>>(async () => {});
  // Rolling estimate of the room's noise floor, measured only while the
  // examiner is silent, so the barge-in threshold adapts to the user's mic.
  const noiseFloorRef = useRef(0.005);
  // --- Part 2 long turn (mock exam only) ---
  // While this is active no mic audio reaches the Live socket, which is what
  // guarantees the examiner stays silent for the full two minutes.
  const longTurnActiveRef = useRef(false);
  const longTurnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror of the countdown readable from callbacks without a stale closure.
  const longTurnSecondsLeftRef = useRef(PART2_TALK_SECONDS);
  // The cue card is announced mid-sentence, so the prep clock must not start
  // until the examiner has actually finished reading the card out.
  const cuePrepPendingRef = useRef(false);
  // One element for every streamed turn: reusing it keeps the autoplay
  // permission granted by the user's first tap.
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  // --- Multi-agent client state ---
  // Browser SpeechRecognition drafts the transcript WHILE the user speaks —
  // the Ear agent on the server verifies it against the real audio.
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const draftTranscriptRef = useRef("");
  const [liveDraft, setLiveDraft] = useState("");
  // Agent 4's per-turn scores accumulate here so the final report is a merge,
  // not a cold re-analysis of the whole session.
  const evalsRef = useRef<LiveTurnEval[]>([]);
  // Agent 3's pronunciation note about the LAST turn — forwarded into the next
  // examiner prompt so the correction is voiced without audio on the path.
  const lastPronRef = useRef("");
  // Index of the newest eval entry — the Analyst's pronunciation band may
  // arrive AFTER the Scorer's eval, so we merge it into the same slot.
  const pendingEvalIdxRef = useRef(-1);
  // Live mode: the candidate's gated speech (mic chunks that passed the
  // examiner-speaking gate AND a voice threshold) accumulates here and is
  // uploaded as one WAV with the report — real audio for pronunciation.
  const livePcmRef = useRef<Int16Array[]>([]);
  const livePcmLenRef = useRef(0);

  // Hard stop for whatever the examiner is saying: pauses, detaches the source
  // so a MediaSource pump can't keep feeding it, and cancels the TTS download.
  const stopAudio = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    window.speechSynthesis.cancel();
    // Barge-in: kill the live turn's event stream and silence its element.
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    const live = liveAudioRef.current;
    if (live && !live.paused) live.pause();
    const a = audioRef.current;
    audioRef.current = null;
    pendingAudioRef.current = null;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
  }, []);

  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(HARSH_STORAGE_KEY) === "1";
      harshRef.current = saved;
      setHarsh(saved);
    } catch {
      /* storage unavailable — stay NORMAL */
    }
  }, []);
  const toggleHarsh = useCallback((next: boolean) => {
    harshRef.current = next;
    setHarsh(next);
    try {
      sessionStorage.setItem(HARSH_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  // NOTE: no page-level scrollIntoView here — it scrolled the whole page and
  // pushed the orb/controls off-screen. StudioTranscript scrolls its own box.

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    analyserStreamRef.current = null;
  }, []);

  // One mic stream for the whole session: asking getUserMedia on every turn
  // costs 200-600ms and is the main reason the first word gets cut off.
  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    const cur = streamRef.current;
    if (cur && cur.getAudioTracks().some((t) => t.readyState === "live")) return cur;
    releaseStream();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        // AGC must stay OFF: it ramps the gain up while the speaker is quiet,
        // so room noise rises to speech level and silence never "arrives".
        autoGainControl: false,
        channelCount: 1,
      },
    });
    stream.getAudioTracks().forEach((t) => {
      t.onmute = () => setMicHint("Mikrofon o'chib qoldi (mute). Tizim/brauzer sozlamalarini tekshiring.");
      t.onunmute = () => setMicHint(null);
      t.onended = () => {
        if (streamRef.current === stream) streamRef.current = null;
      };
    });
    streamRef.current = stream;
    return stream;
  }, [releaseStream]);

  /** Tear down the Live API session: socket, mic worklet, PCM player. */
  const stopLive = useCallback(() => {
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
    const mic = liveMicRef.current;
    liveMicRef.current = null;
    if (mic) {
      try {
        mic.node.port.onmessage = null;
        mic.node.disconnect();
        mic.source.disconnect();
      } catch {
        /* noop */
      }
      void mic.ctx.close().catch(() => {});
    }
    livePlayerRef.current?.dispose();
    livePlayerRef.current = null;
    // NOTE: the Part 2 prep/long-turn flags are deliberately NOT cleared here.
    // stopLive also runs as the first step of a mid-test reconnect, and clearing
    // them would reopen the mic to the model in the middle of the long turn.
    // startSession and generateReport reset them explicitly instead.
  }, []);

  /** Browser recogniser used to draft what the candidate says, live. */
  const startDraftRecognition = useCallback(() => {
    draftTranscriptRef.current = "";
    setLiveDraft("");
    try {
      const Rec =
        (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
      if (!Rec) return;
      const rec = new Rec();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (e: any) => {
        let draft = "";
        for (let i = 0; i < e.results.length; i++) {
          draft += (e.results[i][0]?.transcript || "") + " ";
        }
        draft = draft.trim();
        draftTranscriptRef.current = draft;
        setLiveDraft(draft);
      };
      rec.onerror = () => {};
      rec.start();
      speechRecRef.current = rec;
    } catch {
      /* unavailable — the captured WAV still carries the answer */
    }
  }, []);

  const stopDraftRecognition = useCallback(() => {
    try {
      speechRecRef.current?.stop();
    } catch {
      /* noop */
    }
    speechRecRef.current = null;
  }, []);

  /**
   * End of the Part 2 long turn: either the two minutes elapsed or the
   * candidate tapped "Tugatdim". Records the answer, then hands the examiner
   * back control with an explicit instruction to move on.
   */
  const endLongTurn = useCallback(() => {
    if (!longTurnActiveRef.current) return;
    longTurnActiveRef.current = false;
    if (longTurnTimerRef.current) clearInterval(longTurnTimerRef.current);
    longTurnTimerRef.current = null;
    setLongTurnSeconds(0);

    stopDraftRecognition();
    const said = draftTranscriptRef.current.trim();
    draftTranscriptRef.current = "";
    setLiveDraft("");
    if (!aliveRef.current) return;

    const spokenFor = Math.max(1, PART2_TALK_SECONDS - longTurnSecondsLeftRef.current);
    const topic = cueCardRef.current?.topic || "the cue card topic";

    if (said) {
      setTurns((prev) => [...prev, { role: "user", text: said }]);
      turnDurationsRef.current.push(spokenFor);
      // Score the long turn off-path, exactly like every other answer.
      void apiPost<{ eval?: LiveTurnEval | null }>("/api/speaking/partner/analyze", {
        transcript: said.slice(0, 2000),
        question: topic.slice(0, 400),
        mode: "exam",
        part: 2,
        duration: spokenFor,
      })
        .then((a) => {
          if (!aliveRef.current || !a?.eval) return;
          const ev = a.eval;
          if (ev.fluency != null || ev.grammar != null || ev.lexical != null) {
            evalsRef.current.push(ev);
          }
        })
        .catch(() => {});
    }

    const session = liveSessionRef.current;
    if (!session?.connected) return;

    // Part 2 practice on its own has no Part 3 to move to.
    if (onlyPartRef.current === 2) {
      liveFinishRef.current = true;
      setPhase("thinking");
      session.sendText(
        `(The candidate's two-minute long turn on "${topic}" is over. Say one short closing line, then end with exactly: "That is the end of the speaking test.")`
      );
      return;
    }

    examPartRef.current = 3;
    setExamPart(3);
    setPhase("thinking");
    session.sendText(
      `(The candidate's two-minute long turn is over — the time is up. This is what they said, transcribed: "${
        said.slice(0, 1200) || "(inaudible)"
      }". Do NOT comment on their English. Ask ONE short follow-up about the topic if it is natural, then move straight into Part 3 with your first abstract discussion question linked to "${topic}".)`
    );
  }, [stopDraftRecognition]);

  /**
   * The two-minute individual long turn. The examiner must not make a sound, so
   * the mic is disconnected from the Live socket for its whole duration — the
   * model literally cannot hear a pause to answer into. Audio is still captured
   * locally for the report.
   */
  const startLongTurn = useCallback(() => {
    if (!aliveRef.current) return;
    prepActiveRef.current = false;
    longTurnActiveRef.current = true;
    longTurnSecondsLeftRef.current = PART2_TALK_SECONDS;
    setLongTurnSeconds(PART2_TALK_SECONDS);
    setPhase("long_turn");
    startDraftRecognition();

    if (longTurnTimerRef.current) clearInterval(longTurnTimerRef.current);
    longTurnTimerRef.current = setInterval(() => {
      longTurnSecondsLeftRef.current -= 1;
      const left = longTurnSecondsLeftRef.current;
      setLongTurnSeconds(Math.max(0, left));
      if (left <= 0) endLongTurn();
    }, 1000);
  }, [startDraftRecognition, endLongTurn]);

  /** The one minute of preparation that precedes the long turn. */
  const startPart2Prep = useCallback(() => {
    if (!aliveRef.current) return;
    cuePrepPendingRef.current = false;
    prepActiveRef.current = true;
    setPhase("prep");
    setPrepSeconds(PART2_PREP_SECONDS);
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    prepTimerRef.current = setInterval(() => {
      setPrepSeconds((s) => {
        if (s <= 1) {
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          prepTimerRef.current = null;
          startLongTurn();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [startLongTurn]);

  /**
   * Gemini Live path: mint an ephemeral token, open the socket, stream mic
   * PCM both ways. Throws on any failure — the caller falls back to the
   * legacy record → Gemini → ElevenLabs pipeline.
   */
  const startLiveSession = async (
    m: StudioMode,
    startPart: ExamPart,
    resumeHandle?: string
  ) => {
    const resuming = !!resumeHandle;
    const player = new PcmPlayer();
    livePlayerRef.current = player;
    // What happens once the examiner's turn is genuinely over — meaning its last
    // sample has left the speaker, not merely that the model stopped composing.
    const settleTurn = () => {
      if (!aliveRef.current) return;
      micGateUntilRef.current = 0;
      if (liveFinishRef.current) {
        liveFinishRef.current = false;
        void generateReportRef.current();
        return;
      }
      // The cue card has now been read out in full — the minute starts here.
      if (cuePrepPendingRef.current) {
        startPart2Prep();
        return;
      }
      if (!prepActiveRef.current && !longTurnActiveRef.current) setPhase("listening");
    };

    player.setOnEmpty(() => {
      if (!liveDrainPendingRef.current) return;
      liveDrainPendingRef.current = false;
      settleTurn();
    });

    const tok = await apiPost<{
      token: string;
      model: string;
      sessionConfig: Record<string, unknown>;
    }>("/api/speaking/live-token", {
      mode: m,
      part: startPart,
      partner_name: partnerName,
      user_name: profile?.full_name || "",
      harsh: harshRef.current,
      first_turn: firstTurnRef.current,
    });
    if (firstTurnRef.current) liveChargedRef.current = true;
    if (!aliveRef.current) throw new Error("aborted");

    // Detect the cue card announcement and show the card. The prep clock is
    // NOT started here: the examiner is still mid-sentence reading the topic and
    // its bullet points aloud, and starting the minute now used to eat 10-15
    // seconds of the candidate's preparation time. onTurnComplete starts it.
    const maybeCueCard = (acc: string) => {
      if (modeRef.current !== "exam" || cueCardRef.current) return;
      if (!/cue card/i.test(acc)) return;
      const mTopic = acc.match(/describe [^.!?\n]+/i);
      const raw = mTopic ? mTopic[0].trim().replace(/[.,;:!?]+$/, "") : "Describe your topic";
      const cc: StudioCueCard = {
        topic: raw.charAt(0).toUpperCase() + raw.slice(1),
        bullets: [],
      };
      cueCardRef.current = cc;
      setCueCard(cc);
      examPartRef.current = 2;
      setExamPart(2);
      cuePrepPendingRef.current = true;
    };

    const session = await GeminiLiveSession.connect(tok.token, tok.model, tok.sessionConfig, {
      onAudio: (pcm) => {
        // A reply arriving proves the (re)connection is healthy.
        liveReconnectsRef.current = 0;
        // Part 2 is the candidate's floor alone. The model is fed silence and so
        // should never speak here, but if it ever does, it is not played — the
        // guarantee that the examiner stays quiet does not depend on the model.
        if (prepActiveRef.current || longTurnActiveRef.current) return;
        player.push(pcm);
        // Mic gate (same trick as Jarvis): stop forwarding mic audio while the
        // examiner talks. Speaker echo would otherwise register as "start of
        // speech" and cut the reply off mid-sentence.
        micGateUntilRef.current = Date.now() + MIC_GATE_TAIL_MS;
        if (aliveRef.current && !prepActiveRef.current) setPhase("speaking");
      },
      onInputTranscript: (t) => {
        if (!aliveRef.current) return;
        if (!userTurnOpenRef.current) userSpeakStartRef.current = Date.now();
        pendingUserRef.current += t;
        const text = pendingUserRef.current;
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (userTurnOpenRef.current && last?.role === "user") {
            next[next.length - 1] = { ...last, text };
          } else {
            userTurnOpenRef.current = true;
            next.push({ role: "user", text });
          }
          return next;
        });
      },
      onOutputTranscript: (t) => {
        if (!aliveRef.current) return;
        if (userTurnOpenRef.current) {
          // The candidate's turn just ended — measure its speaking time.
          turnDurationsRef.current.push(
            Math.max(1, Math.round((Date.now() - userSpeakStartRef.current) / 1000))
          );
          // Background analysis: score this answer and (in chat mode) fetch
          // the correction chip — the examiner's voice never waits for it.
          const said = pendingUserRef.current.trim();
          if (said) {
            const question =
              [...turnsRef.current].reverse().find((x) => x.role === "partner")?.text || "";
            const uIdx = turnsRef.current.length - 1;
            const dur = turnDurationsRef.current.at(-1) || 0;
            const m = modeRef.current;
            void apiPost<{
              correction?: StudioTurn["correction"];
              vocab_tip?: StudioTurn["vocab_tip"];
              eval?: LiveTurnEval | null;
            }>("/api/speaking/partner/analyze", {
              transcript: said.slice(0, 2000),
              question: question.slice(0, 400),
              mode: m,
              part: examPartRef.current,
              duration: dur,
            })
              .then((a) => {
                if (!aliveRef.current || !a) return;
                if (a.eval && (a.eval.fluency != null || a.eval.grammar != null || a.eval.lexical != null)) {
                  evalsRef.current.push(a.eval);
                }
                // Corrections are a chat-mode feature — in an exam they stay
                // invisible until the final report.
                if (m !== "exam" && (a.correction || a.vocab_tip)) {
                  setTurns((prev) =>
                    prev.map((x, i) =>
                      i === uIdx && x.role === "user"
                        ? { ...x, correction: a.correction ?? x.correction ?? null, vocab_tip: a.vocab_tip ?? x.vocab_tip ?? null }
                        : x
                    )
                  );
                }
              })
              .catch(() => {});
          }
        }
        userTurnOpenRef.current = false;
        pendingUserRef.current = "";
        pendingPartnerRef.current += t;
        const text = pendingPartnerRef.current;
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (partnerTurnOpenRef.current && last?.role === "partner") {
            next[next.length - 1] = { ...last, text };
          } else {
            partnerTurnOpenRef.current = true;
            next.push({ role: "partner", text, emotion: "neutral" });
          }
          return next;
        });
        maybeCueCard(text);
        if (
          /end of the speaking test/i.test(text) ||
          (onlyPartRef.current !== null && /end of part/i.test(text))
        ) {
          liveFinishRef.current = true;
        }
      },
      onTurnComplete: () => {
        partnerTurnOpenRef.current = false;
        pendingPartnerRef.current = "";
        if (!aliveRef.current) return;
        // The model has finished composing, but its voice is still coming out of
        // the speaker. Everything that follows a turn — the prep clock, the next
        // listening state, even ending the test — waits for the queue to drain.
        // Generating the report here used to tear the socket down mid-goodbye.
        if (player.isPlaying) {
          liveDrainPendingRef.current = true;
          return;
        }
        settleTurn();
      },
      onInterrupted: () => {
        // Barge-in: flush queued audio, keep whatever transcript arrived. The
        // flush drops the sources without firing onEmpty, so clear the pending
        // drain here too or it would resolve against the next turn.
        player.reset();
        liveDrainPendingRef.current = false;
        micGateUntilRef.current = 0;
        partnerTurnOpenRef.current = false;
        pendingPartnerRef.current = "";
        if (!aliveRef.current) return;
        // Part 2 owns the screen for its full duration — an interrupt must not
        // knock the prep clock or the long turn off it.
        if (prepActiveRef.current || longTurnActiveRef.current) return;
        setPhase("listening");
      },
      onGoAway: () => {
        // The server is about to cut this session. Reconnecting now, while the
        // socket is still healthy, keeps the test seamless.
        void resumeLiveRef.current();
      },
      onClose: (graceful, reason) => {
        if (!aliveRef.current || graceful) return;
        console.warn("[speaking] live socket closed:", reason);
        const handle = liveSessionRef.current?.resumeHandle || liveResumeRef.current;
        stopLive();
        isLiveRef.current = false;
        setIsLive(false);
        if (turnsRef.current.length === 0) {
          // Never got going — transparent fallback to the legacy pipeline.
          liveFailedRef.current = true;
          if (liveChargedRef.current) {
            liveChargedRef.current = false;
            void apiDelete("/api/speaking/live-token").catch(() => {});
          }
          void startSessionRef.current(modeRef.current, onlyPartRef.current);
          return;
        }
        // Mid-test drop: rejoin the same conversation rather than throwing the
        // test away. Only after repeated failures do we degrade.
        if (handle && liveReconnectsRef.current < 3) {
          liveResumeRef.current = handle;
          void resumeLiveRef.current(handle);
          return;
        }
        setError("Jonli rejim uzildi — oddiy rejimda davom etadi.");
        setPhase("idle");
      },
    });
    if (!aliveRef.current) {
      session.close();
      throw new Error("aborted");
    }
    liveSessionRef.current = session;

    // Kick off the greeting the instant the socket is up. This used to run last,
    // after getUserMedia and the worklet had loaded, which left 200-700ms of
    // silence before the examiner said anything. The candidate cannot talk over
    // a greeting they have not heard yet, so nothing is lost by starting it
    // while the mic is still being wired up.
    player.warmup();
    if (resuming) {
      // Rejoined mid-test: the examiner is in the middle of an exam, not meeting
      // the candidate. Say nothing and go straight back to listening.
      setPhase("listening");
    } else {
      setPhase("thinking");
      session.sendText("(The candidate has just joined the room. Greet them and begin.)");
    }

    // Mic → PCM16 @16kHz → socket. The worklet context asks for 16kHz; where
    // the browser ignores it we resample on the main thread.
    const stream = await ensureStream();
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule("/audio/pcm-worklet.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    const sink = ctx.createGain();
    sink.gain.value = 0; // keep the graph pulling without audible feedback
    source.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    node.port.onmessage = (e: MessageEvent) => {
      const data = e.data as { pcm: Int16Array; rms: number };
      const now = performance.now();
      if (now - micLevelAtRef.current > 120) {
        micLevelAtRef.current = now;
        setMicLevel(Math.min(1, data.rms * 5));
      }
      const pcm16 = resampleTo16k(data.pcm, ctx.sampleRate);

      // Part 2: during preparation and the two-minute long turn the examiner
      // must not make a sound. The candidate's speech is withheld from the model
      // so it never hears a pause it could answer into — but we keep the socket
      // fed with digital silence, because two minutes of nothing at all risks the
      // session being dropped as idle, which would kill the test mid-Part-2.
      // Silence never trips the VAD, so the examiner stays quiet either way.
      const silentWindow = prepActiveRef.current || longTurnActiveRef.current;
      if (silentWindow) {
        session.sendAudio(new Int16Array(pcm16.length));
      } else {
        // While the examiner speaks the mic is energy-gated, not muted: quiet
        // frames (room noise, residual speaker echo) are dropped, but genuine
        // speech is forwarded so the server's VAD can fire `interrupted` and the
        // candidate can actually cut in. Muting outright made barge-in impossible.
        const examinerAudible = player.isPlaying || Date.now() < micGateUntilRef.current;
        if (examinerAudible) {
          const bar = Math.max(BARGE_IN_RMS_FLOOR, noiseFloorRef.current * BARGE_IN_RMS_FACTOR);
          if (data.rms >= bar) session.sendAudio(pcm16);
        } else {
          // Track the noise floor only when nothing is coming out of the speaker,
          // so the threshold reflects the room rather than the examiner's voice.
          noiseFloorRef.current = noiseFloorRef.current * 0.95 + Math.min(data.rms, 0.05) * 0.05;
          session.sendAudio(pcm16);
        }
      }

      // Keep the candidate's own speech for the end-of-test pronunciation
      // analysis — only chunks with real voice energy, capped at ~3 minutes
      // (rolling window keeps the freshest speech, e.g. the Part 2 long turn).
      if (data.rms > 0.01) {
        livePcmRef.current.push(pcm16);
        livePcmLenRef.current += pcm16.length;
        const cap = 16000 * 180;
        while (livePcmLenRef.current > cap && livePcmRef.current.length) {
          livePcmLenRef.current -= livePcmRef.current[0].length;
          livePcmRef.current.shift();
        }
      }
    };
    liveMicRef.current = { ctx, node, source };

    firstTurnRef.current = false;
    isLiveRef.current = true;
    setIsLive(true);
    // The session clock keeps running across a reconnect — restarting it would
    // hand the candidate free time on the 20-minute cap.
    if (!resuming) {
      setSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
  };

  /**
   * Rejoin a live session that dropped (or is about to) using its resumption
   * handle, so a socket failure mid-test does not cost the candidate the test.
   */
  const resumeLive = useCallback(async (handle?: string) => {
    if (!aliveRef.current || liveResumingRef.current) return;
    const h = handle || liveSessionRef.current?.resumeHandle || liveResumeRef.current;
    if (!h) return;
    liveResumingRef.current = true;
    liveReconnectsRef.current += 1;
    liveResumeRef.current = h;
    try {
      stopLive();
      await startLiveSessionRef.current(modeRef.current, examPartRef.current, h);
    } catch (e) {
      console.warn("[speaking] live resume failed:", (e as Error)?.message || e);
      if (!aliveRef.current) return;
      setError("Jonli rejim uzildi — oddiy rejimda davom etadi.");
      setPhase("idle");
    } finally {
      liveResumingRef.current = false;
    }
  }, [stopLive]);

  startLiveSessionRef.current = startLiveSession;
  resumeLiveRef.current = resumeLive;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      window.speechSynthesis.cancel();
      stopLive();
      stopAudio();
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
      if (longTurnTimerRef.current) clearInterval(longTurnTimerRef.current);
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopAudio, stopLive]);

  const handlePartnerDone = useCallback(() => {
    if (!aliveRef.current) return;
    const next = afterSpeakRef.current;
    afterSpeakRef.current = "auto";
    if (next === "prep") { startPrepRef.current(); return; }
    if (next === "finish") { generateReportRef.current(); return; }
    startRecordingRef.current();
  }, []);

  const syncMemory = useCallback(() => {
    if (memorySyncedRef.current) return;
    const t = turnsRef.current;
    if (t.filter((x) => x.role === "user").length === 0) return;
    memorySyncedRef.current = true;
    void apiPost("/api/speaking/partner/memory", {
      turns: t.map((x) => ({ role: x.role, text: x.text })),
    }).catch(() => {});
  }, []);

  // TTS with mode-aware voice + show text immediately for perceived speed
  const playPartner = useCallback(
    async (text: string, emo: StudioEmotion, ttsMode: StudioMode) => {
      if (!aliveRef.current) return;
      stopAudio();
      setPhase("speaking");
      const abort = new AbortController();
      ttsAbortRef.current = abort;
      try {
        const res = await apiPostStream(
          "/api/speaking/partner/tts",
          { text, emotion: emo, mode: ttsMode },
          abort.signal
        );
        // The user left the page (or interrupted) while TTS was downloading.
        if (!aliveRef.current || abort.signal.aborted) {
          res.body?.cancel().catch(() => {});
          return;
        }
        const audio = new Audio();
        audioRef.current = audio;
        let url = "";
        audioCleanupRef.current = () => {
          if (url) URL.revokeObjectURL(url);
        };

        // Progressive playback: feed mp3 chunks into MediaSource as they arrive
        // so the voice starts on the first bytes instead of the full file.
        const canStream =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported("audio/mpeg") &&
          !!res.body;

        if (canStream) {
          const ms = new MediaSource();
          url = URL.createObjectURL(ms);
          audio.src = url;
          ms.addEventListener("sourceopen", () => {
            const sb = ms.addSourceBuffer("audio/mpeg");
            const reader = res.body!.getReader();
            abort.signal.addEventListener("abort", () => reader.cancel().catch(() => {}), { once: true });
            const finish = () => {
              if (ms.readyState !== "open") return;
              if (sb.updating) sb.addEventListener("updateend", finish, { once: true });
              else ms.endOfStream();
            };
            const pump = async () => {
              try {
                const { done, value } = await reader.read();
                if (done || abort.signal.aborted || audioRef.current !== audio) {
                  finish();
                  return;
                }
                if (sb.updating) {
                  await new Promise((r) => sb.addEventListener("updateend", r, { once: true }));
                }
                sb.appendBuffer(value);
                void pump();
              } catch {
                finish();
              }
            };
            void pump();
          });
        } else {
          const blob = await res.blob();
          if (!aliveRef.current || abort.signal.aborted) return;
          url = URL.createObjectURL(blob);
          audio.src = url;
        }

        const done = () => {
          if (audioRef.current !== audio) return;
          URL.revokeObjectURL(url);
          audioRef.current = null;
          audioCleanupRef.current = null;
          handlePartnerDone();
        };
        audio.onended = done;
        audio.onerror = done;
        try {
          await audio.play();
        } catch (err) {
          if (!aliveRef.current) return;
          // Autoplay blocked — wait for one tap, then continue automatically.
          if ((err as Error)?.name === "NotAllowedError") {
            pendingAudioRef.current = audio;
            setError("Boshlash uchun yuzga bir marta bosing");
            setPhase("idle");
            return;
          }
          throw err;
        }
      } catch (err) {
        if (!aliveRef.current || (err as Error)?.name === "AbortError") return;
        audioRef.current = null;
        // ElevenLabs quota/billing down → keep the session alive with the
        // browser's built-in voice instead of killing the turn.
        if ("speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(text);
          // Uzbek Latin text reads best through a Turkish voice; everything
          // else stays English.
          utter.lang = /[ʻʼ]/.test(text) ? "tr-TR" : "en-US";
          const finish = () => {
            if (aliveRef.current && !abort.signal.aborted) handlePartnerDone();
          };
          utter.onend = finish;
          utter.onerror = finish;
          window.speechSynthesis.speak(utter);
          return;
        }
        setError("Ovoz xizmatida xatolik. Qayta urinib ko'ring.");
        setPhase("idle");
      }
    },
    [handlePartnerDone, stopAudio]
  );

  const resume = useCallback(() => {
    setError(null);
    if (isLiveRef.current) {
      // Live sessions are always listening; a dead socket means we already
      // fell back to the legacy pipeline.
      if (liveSessionRef.current?.connected) return;
      isLiveRef.current = false;
      setIsLive(false);
    }
    const pending = pendingAudioRef.current;
    if (pending) {
      pendingAudioRef.current = null;
      setPhase("speaking");
      pending.play().catch(() => startRecordingRef.current());
      return;
    }
    silenceStrikesRef.current = 0;
    startRecordingRef.current();
  }, []);

  const startSession = async (m: StudioMode, part: ExamPart | null = null) => {
    const startPart: ExamPart = m === "exam" && part ? part : 1;
    setMode(m);
    modeRef.current = m;
    onlyPartRef.current = m === "exam" ? part : null;
    setOnlyPart(m === "exam" ? part : null);
    examPartRef.current = startPart;
    setExamPart(startPart);
    setMicHint(null);
    answersInPartRef.current = 0;
    partStartRef.current = Date.now();
    cueCardRef.current = null;
    afterSpeakRef.current = "auto";
    userBlobsRef.current = [];
    turnDurationsRef.current = [];
    evalsRef.current = [];
    livePcmRef.current = [];
    livePcmLenRef.current = 0;
    pendingEvalIdxRef.current = -1;
    lastPronRef.current = "";
    draftTranscriptRef.current = "";
    setLiveDraft("");
    // Part 2 long turn state from any previous run in this tab.
    if (longTurnTimerRef.current) clearInterval(longTurnTimerRef.current);
    longTurnTimerRef.current = null;
    longTurnActiveRef.current = false;
    prepActiveRef.current = false;
    cuePrepPendingRef.current = false;
    longTurnSecondsLeftRef.current = PART2_TALK_SECONDS;
    setLongTurnSeconds(PART2_TALK_SECONDS);
    setPrepSeconds(PART2_PREP_SECONDS);
    firstTurnRef.current = true;
    silenceStrikesRef.current = 0;
    memorySyncedRef.current = false;
    sessionTokenRef.current = "";
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
      setError("Sessiya vaqti tugadi (20 daqiqa). Hisobot tayyorlanmoqda.");
      void generateReportRef.current();
    }, MAX_SESSION_MS);
    setCueCard(null);
    setReport(null);
    setError(null);
    setPhase("thinking");

    // Pre-warm audio context for faster mic startup
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx && !audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
      audioCtxRef.current.resume().catch(() => {});
    }
    // Ask for the mic now (inside the user gesture) while the greeting loads.
    void ensureStream().catch(() => {});
    // Create the reusable playback element inside the gesture so streamed
    // turns never hit an autoplay block, and warm the upstream connections
    // (DNS + TLS to Gemini/ElevenLabs) before the first real turn.
    if (!liveAudioRef.current) {
      const el = new Audio();
      el.preload = "auto";
      liveAudioRef.current = el;
    }
    void apiPost("/api/speaking/warmup", {}).catch(() => {});

    // Gemini Live API (native audio) is the primary path: audio in and audio
    // out over ONE socket, so the examiner answers in a few hundred ms instead
    // of the seconds the record → upload → Gemini → ElevenLabs pipeline needs.
    // The multi-agent pipeline below stays as the automatic fallback.
    const USE_GEMINI_LIVE = true;
    if (USE_GEMINI_LIVE && !liveFailedRef.current) {
      try {
        await startLiveSession(m, startPart);
        return;
      } catch (e) {
        liveFailedRef.current = true;
        isLiveRef.current = false;
        setIsLive(false);
        stopLive();
        const msg = (e as Error)?.message || "";
        // The legacy pipeline is ~10x slower — never hide why we landed here.
        console.warn("[speaking] live mode failed, using legacy pipeline:", msg || e);
        if (msg.includes("Trial limit") || msg.includes("402")) {
          setUpgradeNeeded(true);
          return;
        }
        if (liveChargedRef.current) {
          liveChargedRef.current = false;
          void apiDelete("/api/speaking/live-token").catch(() => {});
        }
        if (!aliveRef.current) return;
        setMicHint("Jonli rejim ulanmadi — sekin rejimda ishlayapti. (Console'da '[speaking]' qidiruvini tekshiring)");
      }
    }

    const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "";
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const name = firstName ? ", " + firstName : "";
    let greeting =
      m === "exam"
        ? startPart === 2
          ? pick([
              `Good afternoon${name}. I'm ${partnerName}. We'll go straight to Part 2. You have one minute to prepare, then speak for one to two minutes. Your topic is: ${FALLBACK_CUE.topic}`,
              `Hello${name}, take a seat. I'm ${partnerName}. We're starting at Part 2 today — one minute to prepare, then you speak for up to two minutes. Here is your topic: ${FALLBACK_CUE.topic}`,
              `Good afternoon${name}. ${partnerName} here. Straight into Part 2: prepare for one minute, then talk for one to two minutes. The topic: ${FALLBACK_CUE.topic}`,
            ])
          : startPart === 3
          ? pick([
              `Good afternoon${name}. I'm ${partnerName}. Let's go straight to Part 3. Why do you think some people are more influential in society than others?`,
              `Hello${name}, I'm ${partnerName}. We're jumping into Part 3 — deeper questions today. First: do you think technology has changed how people make friends?`,
              `Good afternoon${name}. ${partnerName} speaking. Part 3 only today. Let's start with this: what makes a good neighbour?`,
            ])
          : pick([
              `Good afternoon${name}. I'm ${partnerName}, your examiner today. Let's begin with Part 1. Could you tell me your full name, please?`,
              `Hello${name}, please sit down. I'm ${partnerName} and I'll be examining you today. Let's start — what's your full name?`,
              `Good afternoon${name}. My name is ${partnerName}. Shall we begin? Tell me — do you work, or are you a student?`,
              `Hi${name}, come in. I'm ${partnerName}. We'll start with a few questions about you — where are you from?`,
            ])
        : pick([
            `Hey${firstName ? " " + firstName : ""}, it's ${partnerName}. Ready to work? Tell me — what did you actually do today?`,
            `Look who's back${firstName ? " — " + firstName : ""}! ${partnerName} here. No warm-up today — tell me something interesting that happened this week.`,
            `Hey${firstName ? " " + firstName : ""}. ${partnerName}. Quick question before anything else — what's one thing you want to get better at this week?`,
            `${firstName ? firstName + "! " : ""}Good to hear you. It's ${partnerName}. Talk to me — how's the studying going, honestly?`,
          ]);
    let emo: StudioEmotion = m === "exam" ? "neutral" : "happy";
    let greetingCue: StudioCueCard | null = null;

    try {
      // Personalised greeting is nice-to-have; never let it delay the voice.
      const g = await Promise.race([
        apiPost<{ text: string; emotion: StudioEmotion; cue_card?: StudioCueCard | null }>(
          "/api/speaking/partner/greeting",
          { mode: m, part: startPart, partner_name: partnerName, user_name: profile?.full_name || "" }
        ),
        new Promise<null>((r) => setTimeout(() => r(null), GREETING_TIMEOUT_MS)),
      ]);
      if (g?.text) greeting = g.text;
      if (g?.emotion) emo = g.emotion;
      if (g?.cue_card?.topic) greetingCue = g.cue_card;
    } catch {
      /* fallback greeting already set */
    }
    if (!aliveRef.current) return;

    if (m === "exam" && startPart === 2) {
      const cc = greetingCue ?? FALLBACK_CUE;
      cueCardRef.current = cc;
      setCueCard(cc);
      afterSpeakRef.current = "prep";
    }

    setTurns([{ role: "partner", text: greeting, emotion: emo }]);
    setEmotion(emo);
    setPhase("speaking");
    void playPartner(greeting, emo, m);
  };

  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;

  useEffect(() => {
    const requested = searchParams.get("mode");
    if ((requested === "exam" || requested === "chat") && phase === "intro" && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startSessionRef.current(requested, parsePart(searchParams.get("part")));
    }
  }, [searchParams, phase]);

  const startRecording = useCallback(async () => {
    if (!aliveRef.current) return;
    setError(null);
    window.speechSynthesis.cancel();
    stopAudio();
    discardRef.current = false;
    hasSpokenRef.current = false;
    listenStartRef.current = Date.now();

    const isLongTurn = modeRef.current === "exam" && examPartRef.current === 2;
    recordLimitRef.current = isLongTurn ? 120 : 89;
    // End-of-turn detection: enough room for a mid-answer thinking pause —
    // 0.9s was cutting learners off mid-sentence. The "Javobni tugatdim"
    // button keeps turn-taking fast for users who finish early.
    silenceMsRef.current = isLongTurn ? 2600 : 1400;
    setEmotion("neutral");

    try {
      const stream = await ensureStream();
      if (!aliveRef.current) return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = audioCtx;
      await audioCtx.resume().catch(() => {});
      let analyser = analyserRef.current;
      if (!analyser || analyserStreamRef.current !== stream) {
        analyser = audioCtx.createAnalyser();
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        analyserStreamRef.current = stream;
      }
      // Detection reads frequency data, so the analyser's own smoothing adds
      // decay: keep it low or the level lingers ~1s after speech stops.
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.15;

      // --- Voice activity detection (relative, speech-band) ---
      // Absolute RMS thresholds are unusable in the real world: a loud room, a
      // different mic gain or a fan can sit permanently above any fixed value,
      // and then silence never "arrives". Instead we measure the energy in the
      // speech band (300-3400Hz, which skips low-frequency rumble) in dB and
      // compare it to a rolling noise floor. Voice = at least VOICE_MARGIN_DB
      // above that floor. The floor drops instantly and rises slowly, so any
      // steady noise becomes the new floor within a second or two and the turn
      // still ends. Ending is a plain timestamp rule: no voice frame for
      // silenceMs => stop.
      const VOICE_MARGIN_DB = 9 - Math.min(3, silenceStrikesRef.current) * 1.2;
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const binHz = audioCtx.sampleRate / analyser.fftSize;
      const loBin = Math.max(1, Math.floor(300 / binHz));
      const hiBin = Math.min(analyser.frequencyBinCount - 1, Math.ceil(3400 / binHz));
      let frame = 0;
      let floorDb = 0;
      let calibrated = false;
      let smoothDb = -100;
      let bestDb = -Infinity;
      let bestMargin = 0;
      let voiceMs = 0;
      let lastVoiceAt = 0;
      let lastFrameAt = Date.now();
      const calibrateUntil = Date.now() + 300;
      const stopOnce = () => {
        const r = mediaRecorderRef.current;
        if (r && r.state === "recording") r.stop();
      };

      const monitor = () => {
        const a = analyserRef.current;
        if (!a || !aliveRef.current) return;
        a.getFloatFrequencyData(spectrum);
        let sum = 0;
        let n = 0;
        for (let i = loBin; i <= hiBin; i++) {
          const v = spectrum[i];
          if (Number.isFinite(v)) {
            sum += v;
            n++;
          }
        }
        // Pure digital silence reports -Infinity in every bin.
        const bandDb = n > 0 ? sum / n : -140;
        smoothDb = smoothDb * 0.5 + bandDb * 0.5;
        bestDb = Math.max(bestDb, smoothDb);
        frame++;

        const now = Date.now();
        const dt = now - lastFrameAt;
        lastFrameAt = now;
        const listenedMs = now - listenStartRef.current;

        if (!calibrated) {
          floorDb = frame === 1 ? smoothDb : Math.min(floorDb, smoothDb);
          if (now < calibrateUntil) {
            rafRef.current = requestAnimationFrame(monitor);
            return;
          }
          calibrated = true;
        }

        // Asymmetric tracking: follow quiet frames immediately, creep upward
        // very slowly (~1.5 dB/s) so sustained noise is re-learned as silence
        // while real speech always stays well above.
        if (smoothDb < floorDb) floorDb = floorDb + (smoothDb - floorDb) * 0.4;
        else floorDb += Math.min(0.05, (dt / 1000) * 1.5);

        const margin = smoothDb - floorDb;
        bestMargin = Math.max(bestMargin, margin);
        if (frame % 2 === 0) setMicLevel(Math.max(0, Math.min(1, margin / 26)));
        if (process.env.NODE_ENV !== "production" && frame % 30 === 0) {
          console.debug(
            `[vad] band=${smoothDb.toFixed(1)}dB floor=${floorDb.toFixed(1)}dB margin=${margin.toFixed(1)}dB ` +
              `voice=${margin >= VOICE_MARGIN_DB} silent=${hasSpokenRef.current ? now - lastVoiceAt : 0}ms`
          );
        }

        // A mic that never produces any signal at all is muted / wrong device.
        if (listenedMs > 4000 && bestDb < -120 && micHealthyRef.current) {
          micHealthyRef.current = false;
          setMicHint("Mikrofon ovoz olmayapti. Brauzer manzil satridagi mikrofon belgisini va tizimdagi kirish qurilmasini tekshiring.");
        } else if (bestDb >= -120 && !micHealthyRef.current) {
          micHealthyRef.current = true;
          setMicHint(null);
        }

        if (margin >= VOICE_MARGIN_DB) {
          lastVoiceAt = now;
          voiceMs += dt;
          if (!hasSpokenRef.current && voiceMs >= 200) hasSpokenRef.current = true;
        }

        if (hasSpokenRef.current) {
          if (now - lastVoiceAt >= silenceMsRef.current) {
            stopOnce();
            return;
          }
        } else if (listenedMs > NO_SPEECH_MS) {
          // No clear speech. If something clearly rose above the room floor,
          // still send it — let the model decide rather than telling a quiet
          // speaker "I can't hear you".
          discardRef.current = bestMargin < VOICE_MARGIN_DB * 0.6;
          stopOnce();
          return;
        }
        rafRef.current = requestAnimationFrame(monitor);
      };
      rafRef.current = requestAnimationFrame(monitor);

      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
        typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(m) : false
      );
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (!aliveRef.current) return;
        try {
          speechRecRef.current?.stop();
        } catch {
          /* noop */
        }
        speechRecRef.current = null;
        setLiveDraft("");
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (timerRef.current) clearInterval(timerRef.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        setSeconds(0);
        setMicLevel(0);
        if (discardRef.current) {
          // Nobody spoke — the examiner nudges and keeps listening (fully automatic).
          silenceStrikesRef.current += 1;
          if (silenceStrikesRef.current > 3) {
            setPhase("idle");
            return;
          }
          const pool = modeRef.current === "exam" ? EXAM_NUDGES : SILENCE_NUDGES;
          const nudge = pool[Math.floor(Math.random() * pool.length)];
          setEmotion(nudge.emotion);
          void playPartner(nudge.text, nudge.emotion, modeRef.current);
          return;
        }
        silenceStrikesRef.current = 0;
        // Trailing silence is what ended the turn, so it isn't speaking time.
        const spoken = (Date.now() - listenStartRef.current - silenceMsRef.current) / 1000;
        turnDurationsRef.current.push(Math.max(1, Math.round(spoken)));
        void sendTurn(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      // Agent 2's client half: the browser's SpeechRecognition drafts a
      // transcript WHILE the user speaks — the candidate watches their words
      // appear live, and the draft is sent as a hint for the server's Ear.
      draftTranscriptRef.current = "";
      setLiveDraft("");
      try {
        const Rec =
          (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
        if (Rec) {
          const rec = new Rec();
          rec.lang = "en-US";
          rec.interimResults = true;
          rec.continuous = true;
          rec.onresult = (e: any) => {
            let draft = "";
            for (let i = 0; i < e.results.length; i++) {
              draft += (e.results[i][0]?.transcript || "") + " ";
            }
            draft = draft.trim();
            draftTranscriptRef.current = draft;
            setLiveDraft(draft);
          };
          rec.onerror = () => {};
          rec.start();
          speechRecRef.current = rec;
        }
      } catch {
        /* SpeechRecognition unavailable — the Ear still transcribes server-side */
      }

      // No-speech timeout starts only once the mic is actually live — the
      // permission prompt must not eat into it.
      listenStartRef.current = Date.now();
      setPhase("listening");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= recordLimitRef.current) {
            mediaRecorderRef.current?.stop();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      const name = (err as Error)?.name || "";
      setError(
        name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "Mikrofon topilmadi. Qurilmani ulab, qayta urinib ko'ring."
          : name === "NotReadableError"
          ? "Mikrofon boshqa dastur tomonidan band. Uni yopib, qayta urinib ko'ring."
          : "Mikrofonga ruxsat bering."
      );
      setPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, partnerName, profile, ensureStream, stopAudio]);

  startRecordingRef.current = startRecording;

  const startPrep = useCallback(() => {
    setPhase("prep");
    setPrepSeconds(60);
    prepTimerRef.current = setInterval(() => {
      setPrepSeconds((s) => {
        if (s <= 1) {
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          prepTimerRef.current = null;
          startRecordingRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);
  startPrepRef.current = startPrep;

  const generateReport = useCallback(async () => {
    window.speechSynthesis.cancel();
    stopLive();
    isLiveRef.current = false;
    setIsLive(false);
    stopAudio();
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    if (longTurnTimerRef.current) clearInterval(longTurnTimerRef.current);
    longTurnTimerRef.current = null;
    longTurnActiveRef.current = false;
    prepActiveRef.current = false;
    cuePrepPendingRef.current = false;
    stopDraftRecognition();
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    releaseStream();
    setPhase("report_loading");
    syncMemory();
    try {
      const form = new FormData();
      form.append("mode", modeRef.current);
      form.append("partner_name", partnerName);
      form.append("turns", JSON.stringify(turnsRef.current.map((t) => ({ role: t.role, text: t.text }))));
      // Agent 4's running scores: the report merges them instead of
      // re-analysing the session from scratch — and when they cover most
      // turns, the audio blobs (which the Analyst already heard) don't need
      // re-uploading at all, so the report is near-instant.
      const evals = evalsRef.current;
      form.append("evals", JSON.stringify(evals));
      const userTurnCount = turnsRef.current.filter((t) => t.role === "user").length;
      // Live mode captured the candidate's gated speech as PCM — send it as
      // one WAV so the report hears real pronunciation, pace and pauses.
      const wav = pcmChunksToWavBlob(livePcmRef.current);
      if (wav) form.append("audio", wav, "session.wav");
      if (evals.length < userTurnCount * 0.8) {
        userBlobsRef.current.forEach((b, i) => form.append("audio", b, `turn-${i}.webm`));
      }
      form.append("durations", JSON.stringify(turnDurationsRef.current));
      // One silent retry. This is the payoff of a 15-minute test, and the
      // failure that loses it is almost always a transient upstream blip —
      // the candidate should never have to discover that the "Hisobot" button
      // is what rescues their session.
      let res: StudioReport | null = null;
      let firstErr: unknown = null;
      for (let attempt = 0; attempt < 2 && aliveRef.current; attempt++) {
        try {
          res = await apiPostForm<StudioReport>("/api/speaking/partner/report", form);
          break;
        } catch (e) {
          firstErr = firstErr ?? e;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 2500));
        }
      }
      if (!aliveRef.current) return;
      if (!res) throw firstErr ?? new Error("Hisobot tayyorlanmadi.");
      setReport(res);
      setPhase("report");
    } catch (e: unknown) {
      if (!aliveRef.current) return;
      const msg = (e as Error)?.message || "Hisobot tayyorlashda xatolik.";
      // The transcript, scores and audio are all still in memory, so the
      // "Hisobot" button really can recover this — say so.
      setError(`${msg} Suhbatingiz saqlanib turibdi — "Hisobot" tugmasini qayta bosing.`);
      setPhase("idle");
    }
  }, [partnerName, syncMemory, releaseStream, stopAudio, stopLive, stopDraftRecognition]);
  generateReportRef.current = generateReport;

  const exitSession = useCallback(() => {
    syncMemory();
    stopLive();
    stopAudio();
    releaseStream();
    router.push("/speaking");
  }, [router, syncMemory, releaseStream, stopAudio, stopLive]);

  const buildExamInstruction = () => {
    const part = examPartRef.current;
    const answered = answersInPartRef.current + 1;
    const single = onlyPartRef.current !== null;
    if (part === 1) {
      if (answered < P1_QUESTIONS) {
        return {
          instruction: `Part 1: candidate answered ${answered}/${P1_QUESTIONS}. Brief ack, then next Part 1 question — follow-up or new familiar topic.`,
          transition: "none" as const,
        };
      }
      if (single) {
        return {
          instruction: `Final Part 1 question done. Thank them briefly: "That is the end of Part 1." No more questions.`,
          transition: "finish" as const,
        };
      }
      return {
        instruction: `Part 1 done. Introduce Part 2, announce topic aloud. Provide fresh cue_card JSON: "Describe..." + 4 bullets.`,
        transition: "to_part2" as const,
      };
    }
    if (part === 2) {
      if (single) {
        return {
          instruction: `Part 2 long turn finished. Thank them briefly: "Thank you. That is the end of Part 2." No more questions.`,
          transition: "finish" as const,
        };
      }
      return {
        instruction: `Part 2 long turn finished. Thank them, introduce Part 3, ask first abstract question.`,
        transition: "to_part3" as const,
      };
    }
    if (answered < P3_QUESTIONS) {
      return {
        instruction: `Part 3: answered ${answered}/${P3_QUESTIONS}. Brief react, next deeper abstract question.`,
        transition: "none" as const,
      };
    }
    return {
      instruction: `Final question done. Thank them: "That is the end of the speaking test." No more questions.`,
      transition: "finish" as const,
    };
  };

  const sendTurn = async (blob: Blob) => {
    setPhase("thinking");
    userBlobsRef.current.push(blob);
    const isExam = modeRef.current === "exam";
    const exam = isExam ? buildExamInstruction() : null;
    const lastQuestion = [...turnsRef.current].reverse().find((t) => t.role === "partner")?.text || "";

    const form = new FormData();
    form.append("audio", blob, blob.type.includes("mp4") ? "turn.m4a" : "turn.webm");
    form.append("last_question", lastQuestion.slice(0, 400));
    form.append("partner_name", partnerName);
    form.append("user_name", profile?.full_name || "");
    form.append("first_turn", firstTurnRef.current ? "1" : "0");
    form.append("mode", modeRef.current);
    form.append("harsh", harshRef.current ? "1" : "0");
    if (sessionTokenRef.current) form.append("session", sessionTokenRef.current);
    if (exam) {
      form.append("exam_instruction", exam.instruction);
      form.append("exam_part", String(examPartRef.current));
      form.append("exam_elapsed", String(Math.round((Date.now() - partStartRef.current) / 1000)));
      if (exam.transition === "to_part2") form.append("wants_cue_card", "1");
      const cc = cueCardRef.current;
      if (cc && examPartRef.current >= 2) {
        form.append("exam_cue", `${cc.topic} (${cc.bullets.join("; ")})`);
      }
    }
    form.append("history", JSON.stringify(turnsRef.current.map((t) => ({ role: t.role, text: t.text }))));
    // Multi-agent fields: the SpeechRecognition draft (Ear hint), the
    // Analyst's pronunciation note about the previous turn (voiced by the
    // examiner), and this turn's speaking time (Scorer input).
    if (draftTranscriptRef.current) {
      form.append("draft_transcript", draftTranscriptRef.current.slice(0, 1500));
    }
    if (lastPronRef.current) {
      // In an exam the examiner never voices corrections — the note stays
      // for the report only, so it is not forwarded into the next prompt.
      if (modeRef.current !== "exam") {
        form.append("pronunciation_notes", lastPronRef.current.slice(0, 400));
      }
      lastPronRef.current = "";
    }
    form.append("turn_duration", String(turnDurationsRef.current.at(-1) || 0));

    const audio = liveAudioRef.current || new Audio();
    liveAudioRef.current = audio;
    const abort = new AbortController();
    liveAbortRef.current = abort;

    const tSend = performance.now();
    let partnerIndex = -1;
    let userIndex = -1;
    let userTranscript = "";
    let replyText = "";
    let streamError: string | null = null;
    // Set when the browser voice is speaking the reply (TTS outage) — it owns
    // the handoff to the next turn via utter.onend instead of handlePartnerDone.
    let ttsFallback = false;

    try {
      // One streamed request: the examiner starts speaking sentence 1 while the
      // model is still writing the rest.
      const res = await apiPostFormStream("/api/speaking/live", form, abort.signal);
      if (!aliveRef.current || abort.signal.aborted) {
        void res.body?.cancel().catch(() => {});
        return;
      }
      firstTurnRef.current = false;

      await playLiveTurn(
        res,
        audio,
        {
          // The Ear's transcript lands first — show the candidate's words
          // immediately instead of waiting for the examiner's reply.
          onTranscript: (t) => {
            if (!aliveRef.current) return;
            userTranscript = t;
            setLiveDraft("");
            setTurns((prev) => {
              const next = [...prev];
              if (userIndex >= 0 && next[userIndex]?.role === "user") {
                next[userIndex] = { ...next[userIndex], text: t };
              } else if (t) {
                userIndex = next.length;
                next.push({ role: "user" as const, text: t });
              }
              return next;
            });
          },
          onMeta: (meta) => {
            if (!aliveRef.current) return;
            if (!userTranscript) userTranscript = meta.transcript || "";
            const emo = (meta.emotion || "neutral") as StudioEmotion;
            setEmotion(emo);

            if (exam) {
              answersInPartRef.current += 1;
              if (exam.transition === "to_part2") {
                examPartRef.current = 2;
                setExamPart(2);
                answersInPartRef.current = 0;
                partStartRef.current = Date.now();
                const cc = meta.cue_card?.topic
                  ? { topic: meta.cue_card.topic, bullets: meta.cue_card.bullets || [] }
                  : FALLBACK_CUE;
                cueCardRef.current = cc;
                setCueCard(cc);
                afterSpeakRef.current = "prep";
              } else if (exam.transition === "to_part3") {
                examPartRef.current = 3;
                setExamPart(3);
                answersInPartRef.current = 0;
                partStartRef.current = Date.now();
              } else if (exam.transition === "finish") {
                afterSpeakRef.current = "finish";
              }
            }

            setTurns((prev) => {
              const next = [...prev];
              if (userTranscript && userIndex < 0) {
                userIndex = next.length;
                next.push({ role: "user" as const, text: userTranscript });
              }
              partnerIndex = next.length;
              next.push({ role: "partner" as const, text: "", emotion: emo });
              return next;
            });
          },
          // Agent 3 — Analyst: correction / vocab / pronunciation for THIS
          // turn, arriving while the examiner is still talking.
          onAnalysis: (a) => {
            if (!aliveRef.current || !a) return;
            if (a.pronunciation?.issue) {
              lastPronRef.current = `${a.pronunciation.issue} — ${a.pronunciation.how_to_say || ""}`.slice(0, 400);
            }
            const pronBand = (a.pronunciation as { band?: number | null } | undefined)?.band ?? null;
            if (pronBand != null && pendingEvalIdxRef.current >= 0) {
              const ev = evalsRef.current[pendingEvalIdxRef.current];
              if (ev && ev.pronunciation == null) ev.pronunciation = pronBand;
            }
            const idx = userIndex;
            // Exam mode: corrections stay invisible until the final report.
            if (idx < 0 || modeRef.current === "exam" || (!a.correction && !a.vocab_tip)) return;
            setTurns((prev) =>
              prev.map((t, i) =>
                i === idx && t.role === "user"
                  ? { ...t, correction: a.correction ?? null, vocab_tip: a.vocab_tip ?? null }
                  : t
              )
            );
          },
          // Agent 4 — Scorer: fold this turn's bands into the running report.
          onEval: (ev) => {
            if (!aliveRef.current || !ev) return;
            evalsRef.current.push({ ...ev });
            pendingEvalIdxRef.current = evalsRef.current.length - 1;
          },
          onSentence: (sentence) => {
            if (!aliveRef.current) return;
            replyText = replyText ? `${replyText} ${sentence}` : sentence;
            const text = replyText;
            setTurns((prev) =>
              prev.map((t, i) => (i === partnerIndex && t.role === "partner" ? { ...t, text } : t))
            );
          },
          onPlaybackStart: () => {
            if (aliveRef.current) setPhase("speaking");
          },
          // ElevenLabs produced no audio at all (quota/outage) — keep the
          // turn alive with the browser's built-in voice, same as playPartner.
          onNoAudio: () => {
            if (!aliveRef.current || !replyText || !("speechSynthesis" in window)) return;
            ttsFallback = true;
            setPhase("speaking");
            const utter = new SpeechSynthesisUtterance(replyText);
            utter.lang = /[ʻʼ]/.test(replyText) ? "tr-TR" : "en-US";
            const done = () => {
              if (aliveRef.current) handlePartnerDone();
            };
            utter.onend = done;
            utter.onerror = done;
            window.speechSynthesis.speak(utter);
          },
          onError: (msg) => {
            streamError = msg;
          },
          onDone: ({ session }) => {
            if (session) sessionTokenRef.current = session;
          },
          onTiming: (timing) => {
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                `[studio] turn ${Math.round(performance.now() - tSend)}ms`,
                timing
              );
            }
          },
        },
        abort.signal
      );

      if (!aliveRef.current || abort.signal.aborted) return;
      if (liveAbortRef.current === abort) liveAbortRef.current = null;

      if (streamError) {
        setError(streamError);
        setPhase("idle");
        return;
      }

      // The browser voice is mid-reply — its onend calls handlePartnerDone.
      if (ttsFallback) return;
      handlePartnerDone();
    } catch (e: unknown) {
      if (!aliveRef.current || (e as Error)?.name === "AbortError") return;
      const msg = (e as Error)?.message || "";
      if (msg.includes("Trial limit") || msg.includes("402")) {
        setUpgradeNeeded(true);
      } else if (msg.includes("Sessiya vaqti tugadi")) {
        // Server enforced the session cap — close the test with a report.
        setError(msg);
        void generateReportRef.current();
        return;
      } else {
        setError(msg || "Xatolik yuz berdi.");
      }
      setPhase(turnsRef.current.length > 0 ? "idle" : "intro");
    }
  };

  // "Javobni tugatdim" — manual end-of-turn. Stopping the recorder runs the
  // normal onstop path, which sends whatever was captured to the examiner.
  const finishAnswer = useCallback(() => {
    if (isLiveRef.current) return; // Live API VAD owns turn-taking
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      discardRef.current = false;
      rec.stop();
    }
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (upgradeNeeded) return <StudioUpgrade />;

  if (phase === "intro") {
    return (
      <StudioIntro
        partnerName={partnerName}
        harsh={harsh}
        onToggleHarsh={toggleHarsh}
        onStartChat={() => void startSession("chat")}
        onStartExam={() => void startSession("exam")}
        onBack={() => router.push("/speaking")}
        error={error}
      />
    );
  }

  if (phase === "report_loading") return <StudioLoading partnerName={partnerName} />;

  if (phase === "report" && report) {
    return (
      <StudioReportView
        report={report}
        partnerName={partnerName}
        onNewSession={() => { autoStartedRef.current = true; setPhase("intro"); }}
        onBack={exitSession}
      />
    );
  }

  return (
    <StudioSession
      partnerName={partnerName}
      mode={mode}
      phase={phase}
      emotion={emotion}
      micLevel={micLevel}
      micHint={micHint}
      turns={turns}
      examPart={examPart}
      onlyPart={onlyPart}
      cueCard={cueCard}
      prepSeconds={prepSeconds}
      longTurnSeconds={longTurnSeconds}
      seconds={seconds}
      error={error}
      chatEndRef={chatEndRef}
      live={isLive}
      liveDraft={liveDraft}
      onInterrupt={() => {
        if (phase !== "speaking") return;
        if (isLiveRef.current) {
          livePlayerRef.current?.reset();
          return;
        }
        stopAudio();
        void startRecording();
      }}
      onResume={resume}
      onDone={finishAnswer}
      onSkipPrep={() => {
        if (prepTimerRef.current) clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
        prepActiveRef.current = false;
        if (isLiveRef.current) {
          // Ready early: start the timed two-minute long turn now.
          if (modeRef.current === "exam") startLongTurn();
          else setPhase("listening");
          return;
        }
        void startRecording();
      }}
      onEndLongTurn={endLongTurn}
      onGenerateReport={() => void generateReport()}
      onExit={exitSession}
      userAnswerCount={turns.filter((t) => t.role === "user").length}
      fmt={fmt}
    />
  );
}

export default function SpeakingPartnerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      }
    >
      <SpeakingPartnerContent />
    </Suspense>
  );
}
