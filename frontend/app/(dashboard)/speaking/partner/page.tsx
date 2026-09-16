"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useSpeakingExaminer } from "@/hooks/useSpeakingExaminer";
import { apiPost, apiPostForm, apiPostFormStream, apiPostStream } from "@/lib/api";
import { playLiveTurn } from "@/lib/speaking/livePlayer";
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
  const [prepSeconds, setPrepSeconds] = useState(60);
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
  // One element for every streamed turn: reusing it keeps the autoplay
  // permission granted by the user's first tap.
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);

  // Hard stop for whatever the examiner is saying: pauses, detaches the source
  // so a MediaSource pump can't keep feeding it, and cancels the TTS download.
  const stopAudio = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
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

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      window.speechSynthesis.cancel();
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
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopAudio]);

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
        setError("Ovoz xizmatida xatolik. Qayta urinib ko'ring.");
        setPhase("idle");
      }
    },
    [handlePartnerDone, stopAudio]
  );

  const resume = useCallback(() => {
    setError(null);
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
    firstTurnRef.current = true;
    silenceStrikesRef.current = 0;
    memorySyncedRef.current = false;
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

    const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "";
    let greeting =
      m === "exam"
        ? startPart === 2
          ? `Good afternoon${firstName ? ", " + firstName : ""}. I'm ${partnerName}. We'll go straight to Part 2. You have one minute to prepare, then speak for one to two minutes. Your topic is: ${FALLBACK_CUE.topic}`
          : startPart === 3
          ? `Good afternoon${firstName ? ", " + firstName : ""}. I'm ${partnerName}. Let's go straight to Part 3. Why do you think some people are more influential in society than others?`
          : `Good afternoon${firstName ? ", " + firstName : ""}. I'm ${partnerName}, your examiner today. Let's begin with Part 1. Could you tell me your full name, please?`
        : `Hey${firstName ? " " + firstName : ""}, it's ${partnerName}. Ready to work? Tell me — what did you actually do today?`;
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
    stopAudio();
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    releaseStream();
    setPhase("report_loading");
    syncMemory();
    try {
      const form = new FormData();
      form.append("mode", modeRef.current);
      form.append("partner_name", partnerName);
      form.append("turns", JSON.stringify(turnsRef.current.map((t) => ({ role: t.role, text: t.text }))));
      userBlobsRef.current.forEach((b, i) => form.append("audio", b, `turn-${i}.webm`));
      form.append("durations", JSON.stringify(turnDurationsRef.current));
      const res = await apiPostForm<StudioReport>("/api/speaking/partner/report", form);
      if (!aliveRef.current) return;
      setReport(res);
      setPhase("report");
    } catch (e: unknown) {
      if (!aliveRef.current) return;
      setError((e as Error)?.message || "Hisobot tayyorlashda xatolik.");
      setPhase("idle");
    }
  }, [partnerName, syncMemory, releaseStream, stopAudio]);
  generateReportRef.current = generateReport;

  const exitSession = useCallback(() => {
    syncMemory();
    stopAudio();
    releaseStream();
    router.push("/speaking");
  }, [router, syncMemory, releaseStream, stopAudio]);

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
          onMeta: (meta) => {
            if (!aliveRef.current) return;
            userTranscript = meta.transcript || "";
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
              if (userTranscript) {
                userIndex = next.length;
                next.push({ role: "user" as const, text: userTranscript });
              }
              partnerIndex = next.length;
              next.push({ role: "partner" as const, text: "", emotion: emo });
              return next;
            });
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
          onError: (msg) => {
            streamError = msg;
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

      // Correction / vocab tip run on a small text model while the examiner is
      // already talking; the bubble fills in when it arrives.
      if (userTranscript && userIndex >= 0) {
        const idx = userIndex;
        void apiPost<{ correction: StudioTurn["correction"]; vocab_tip: StudioTurn["vocab_tip"] }>(
          "/api/speaking/partner/analyze",
          { transcript: userTranscript, question: lastQuestion, mode: modeRef.current }
        )
          .then((a) => {
            if (!aliveRef.current || (!a?.correction && !a?.vocab_tip)) return;
            setTurns((prev) =>
              prev.map((t, i) =>
                i === idx && t.role === "user"
                  ? { ...t, correction: a.correction ?? null, vocab_tip: a.vocab_tip ?? null }
                  : t
              )
            );
          })
          .catch(() => {});
      }

      handlePartnerDone();
    } catch (e: unknown) {
      if (!aliveRef.current || (e as Error)?.name === "AbortError") return;
      const msg = (e as Error)?.message || "";
      if (msg.includes("Trial limit") || msg.includes("402")) setUpgradeNeeded(true);
      else setError(msg || "Xatolik yuz berdi.");
      setPhase(turnsRef.current.length > 0 ? "idle" : "intro");
    }
  };

  // "Javobni tugatdim" — manual end-of-turn. Stopping the recorder runs the
  // normal onstop path, which sends whatever was captured to the examiner.
  const finishAnswer = useCallback(() => {
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
      seconds={seconds}
      error={error}
      chatEndRef={chatEndRef}
      onInterrupt={() => {
        if (phase !== "speaking") return;
        stopAudio();
        void startRecording();
      }}
      onResume={resume}
      onDone={finishAnswer}
      onSkipPrep={() => {
        if (prepTimerRef.current) clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
        void startRecording();
      }}
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
