"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useSpeakingExaminer } from "@/hooks/useSpeakingExaminer";
import { apiPost, apiPostForm, apiPostStream } from "@/lib/api";
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

  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, phase]);

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
        autoGainControl: true,
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
    return () => {
      window.speechSynthesis.cancel();
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const handlePartnerDone = useCallback(() => {
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
      setPhase("speaking");
      try {
        const res = await apiPostStream("/api/speaking/partner/tts", {
          text,
          emotion: emo,
          mode: ttsMode,
        });
        const audio = new Audio();
        audioRef.current = audio;
        let url = "";

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
            const finish = () => {
              if (ms.readyState !== "open") return;
              if (sb.updating) sb.addEventListener("updateend", finish, { once: true });
              else ms.endOfStream();
            };
            const pump = async () => {
              try {
                const { done, value } = await reader.read();
                if (done) {
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
          url = URL.createObjectURL(blob);
          audio.src = url;
        }

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          handlePartnerDone();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          handlePartnerDone();
        };
        try {
          await audio.play();
        } catch (err) {
          // Autoplay blocked — wait for one tap, then continue automatically.
          if ((err as Error)?.name === "NotAllowedError") {
            pendingAudioRef.current = audio;
            setError("Boshlash uchun yuzga bir marta bosing");
            setPhase("idle");
            return;
          }
          throw err;
        }
      } catch {
        audioRef.current = null;
        setError("Ovoz xizmatida xatolik. Qayta urinib ko'ring.");
        setPhase("idle");
      }
    },
    [handlePartnerDone]
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
    setError(null);
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    discardRef.current = false;
    hasSpokenRef.current = false;
    listenStartRef.current = Date.now();

    const isLongTurn = modeRef.current === "exam" && examPartRef.current === 2;
    recordLimitRef.current = isLongTurn ? 120 : 89;
    // Learners pause to think — a too-short window cuts sentences in half and
    // makes the examiner "not understand". Long turn gets the most patience.
    silenceMsRef.current = isLongTurn ? 2600 : modeRef.current === "exam" ? 1700 : 1400;
    setEmotion("neutral");

    try {
      const stream = await ensureStream();

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = audioCtx;
      await audioCtx.resume().catch(() => {});
      let analyser = analyserRef.current;
      if (!analyser || analyserStreamRef.current !== stream) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.4;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        analyserStreamRef.current = stream;
      }

      // --- Adaptive voice activity detection ---
      // Calibrate the room's noise floor for the first 300ms (capped so a fan or
      // AC can't push the threshold out of reach), then use hysteresis. After
      // each silent strike we get more sensitive — a soft voice must never be
      // mistaken for silence.
      const sensitivity = 1 + Math.min(3, silenceStrikesRef.current) * 0.45;
      const data = new Uint8Array(analyser.fftSize);
      let frame = 0;
      let noiseFloor = 0.004;
      let calSamples = 0;
      let smooth = 0;
      let peak = 0;
      let rawMax = 0;
      let speaking = false;
      let speechMs = 0;
      let lastFrameAt = Date.now();
      const calibrateUntil = Date.now() + 300;
      const stopOnce = () => {
        const r = mediaRecorderRef.current;
        if (r && r.state === "recording") r.stop();
      };

      const monitor = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128.0 - 1;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        smooth = smooth * 0.7 + rms * 0.3;
        rawMax = Math.max(rawMax, rms);
        frame++;
        if (frame % 2 === 0) setMicLevel(Math.max(0, smooth - noiseFloor) * 1.5);

        const now = Date.now();
        const dt = now - lastFrameAt;
        lastFrameAt = now;
        const listenedMs = now - listenStartRef.current;
        if (now < calibrateUntil) {
          noiseFloor = Math.min(0.015, (noiseFloor * calSamples + rms) / (calSamples + 1));
          calSamples++;
          rafRef.current = requestAnimationFrame(monitor);
          return;
        }
        peak = Math.max(peak, smooth);

        // A mic that delivers pure digital silence for 4s is muted / wrong device.
        if (listenedMs > 4000 && rawMax < 0.0008 && micHealthyRef.current) {
          micHealthyRef.current = false;
          setMicHint("Mikrofon ovoz olmayapti. Brauzer manzil satridagi mikrofon belgisini va tizimdagi kirish qurilmasini tekshiring.");
        } else if (rawMax >= 0.0008 && !micHealthyRef.current) {
          micHealthyRef.current = true;
          setMicHint(null);
        }

        // Quiet speech through noiseSuppression+AGC can sit at RMS ~0.006.
        const onThreshold = Math.max(0.0045, noiseFloor * 2.2) / sensitivity;
        const offThreshold = Math.max(0.003, noiseFloor * 1.4) / sensitivity;

        if (!speaking && smooth > onThreshold) {
          speaking = true;
        } else if (speaking && smooth < offThreshold) {
          speaking = false;
        }

        if (speaking) {
          // Cumulative speech time — brief dips below the threshold during
          // normal speech must not reset the counter.
          speechMs += dt;
          if (!hasSpokenRef.current && speechMs >= 180) hasSpokenRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (hasSpokenRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(stopOnce, silenceMsRef.current);
        } else if (!hasSpokenRef.current && listenedMs > NO_SPEECH_MS) {
          // VAD saw no clear speech. If there was *any* real energy above the
          // room floor, still send it — let the model decide rather than
          // telling a quiet speaker "I can't hear you".
          discardRef.current = !(peak > noiseFloor * 1.5 && peak > 0.0025);
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
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 96000 })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
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
  }, [turns, partnerName, profile, ensureStream]);

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
    audioRef.current?.pause();
    audioRef.current = null;
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
      const res = await apiPostForm<StudioReport>("/api/speaking/partner/report", form);
      setReport(res);
      setPhase("report");
    } catch (e: unknown) {
      setError((e as Error)?.message || "Hisobot tayyorlashda xatolik.");
      setPhase("idle");
    }
  }, [partnerName, syncMemory, releaseStream]);
  generateReportRef.current = generateReport;

  const exitSession = useCallback(() => {
    syncMemory();
    audioRef.current?.pause();
    releaseStream();
    router.push("/speaking");
  }, [router, syncMemory, releaseStream]);

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
    try {
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("mp4") ? "turn.m4a" : "turn.webm");
      const lastQuestion = [...turnsRef.current].reverse().find((t) => t.role === "partner")?.text || "";
      form.append("last_question", lastQuestion.slice(0, 400));
      form.append("partner_name", partnerName);
      form.append("user_name", profile?.full_name || "");
      form.append("first_turn", firstTurnRef.current ? "1" : "0");
      form.append("mode", modeRef.current);
      if (exam) {
        form.append("exam_instruction", exam.instruction);
        form.append("exam_part", String(examPartRef.current));
        form.append("exam_elapsed", String(Math.round((Date.now() - partStartRef.current) / 1000)));
        const cc = cueCardRef.current;
        if (cc && examPartRef.current >= 2) {
          form.append("exam_cue", `${cc.topic} (${cc.bullets.join("; ")})`);
        }
      }
      form.append("history", JSON.stringify(turnsRef.current.map((t) => ({ role: t.role, text: t.text }))));

      const res = await apiPostForm<{
        user_transcript: string;
        reply: string;
        emotion: StudioEmotion;
        cue_card: StudioCueCard | null;
        correction: StudioTurn["correction"];
        vocab_tip: StudioTurn["vocab_tip"];
      }>("/api/speaking/partner", form);

      firstTurnRef.current = false;

      if (exam) {
        answersInPartRef.current += 1;
        if (exam.transition === "to_part2") {
          examPartRef.current = 2;
          setExamPart(2);
          answersInPartRef.current = 0;
          partStartRef.current = Date.now();
          const cc = res.cue_card ?? FALLBACK_CUE;
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

      // Show text immediately — user reads while TTS loads (feels much faster)
      setTurns((prev) => [
        ...prev,
        ...(res.user_transcript
          ? [{ role: "user" as const, text: res.user_transcript, correction: res.correction, vocab_tip: res.vocab_tip }]
          : []),
        { role: "partner" as const, text: res.reply, emotion: res.emotion },
      ]);
      setEmotion(res.emotion);
      void playPartner(res.reply, res.emotion, modeRef.current);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "";
      if (msg.includes("Trial limit") || msg.includes("402")) setUpgradeNeeded(true);
      else setError(msg || "Xatolik yuz berdi.");
      setPhase(turns.length > 0 ? "idle" : "intro");
    }
  };

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
        audioRef.current?.pause();
        audioRef.current = null;
        void startRecording();
      }}
      onResume={resume}
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
