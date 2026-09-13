"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";

interface AutoSpeakingRecorderProps {
  onComplete: (blob: Blob) => void;
  isCueCard?: boolean;
}

export function AutoSpeakingRecorder({
  onComplete,
  isCueCard = false,
}: AutoSpeakingRecorderProps) {
  const [phase, setPhase] = useState<"listening" | "recording" | "processing">("listening");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [volume, setVolume] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSpokenRef = useRef(false);
  const recordStartRef = useRef(0);
  const lastSpeechAtRef = useRef(0);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
  }, []);

  // Monitor audio volume for VAD (Voice Activity Detection)
  const monitorVolume = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const val = data[i] / 128.0 - 1;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / data.length);
    setVolume(rms);

    // Threshold sits above typical room/mic noise (~0.01) but well below
    // normal speech (~0.05+), so quiet background doesn't count as talking.
    const SPEECH_THRESHOLD = 0.02;
    // ~1.8s of continuous silence after speech = the answer is finished.
    // Short enough to feel like a real conversation, long enough to allow
    // natural mid-sentence pauses.
    const SILENCE_MS = 1800;
    // Never auto-stop inside the first moments of recording.
    const MIN_RECORD_MS = 1500;

    const now = Date.now();
    if (rms > SPEECH_THRESHOLD) {
      hasSpokenRef.current = true;
      lastSpeechAtRef.current = now;
    } else if (
      hasSpokenRef.current &&
      now - lastSpeechAtRef.current > SILENCE_MS &&
      now - recordStartRef.current > MIN_RECORD_MS
    ) {
      stopRecording();
      return;
    }

    rafRef.current = requestAnimationFrame(monitorVolume);
  };

  const startRecording = useCallback(async () => {
    setError(null);
    setPhase("recording");
    setSeconds(0);
    hasSpokenRef.current = false;
    recordStartRef.current = Date.now();
    lastSpeechAtRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;

      // Start VAD monitoring
      rafRef.current = requestAnimationFrame(monitorVolume);

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        cleanup();
        setPhase("processing");
        onComplete(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      // Timer for max recording time (3 min for Part 1/3, 2 min for cue card)
      const maxTime = isCueCard ? 120 : 180;
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= maxTime - 1) {
            stopRecording();
            return s + 1;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access was denied. Please allow microphone permission.");
      setPhase("listening");
    }
  }, [isCueCard, onComplete, stopRecording]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Auto-start recording after a brief beat. This component is only mounted
  // once the question has already finished being spoken (see the parent
  // page), so there's no need to make the candidate wait 2.5s doing nothing —
  // a short pause is enough to feel natural without adding dead air.
  useEffect(() => {
    if (phase === "listening") {
      const timer = setTimeout(() => {
        startRecording();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase, startRecording]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // Symmetric bar multipliers so the waveform reads as a voice waveform
  // (taller in the middle), driven by the real mic RMS level.
  const WAVEFORM_BARS = Array.from({ length: 21 }, (_, i) => {
    const center = Math.abs(i - 10) / 10; // 0 center → 1 edges
    return 0.35 + 0.65 * (1 - center) + 0.12 * Math.sin(i * 1.7);
  });

  // Phase indicator UI
  const getPhaseUI = () => {
    switch (phase) {
      case "listening":
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-accent/20 motion-reduce:animate-none" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                <Mic className="h-5 w-5 text-accent" />
              </div>
            </div>
            <p className="text-sm font-medium text-content-secondary">Get ready…</p>
          </div>
        );
      case "recording":
        return (
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Live waveform driven by real mic input */}
            <div className="flex h-16 items-center gap-1">
              {WAVEFORM_BARS.map((mult, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-[height] duration-75 motion-reduce:transition-none ${
                    hasSpokenRef.current ? "bg-accent-red" : "bg-content-secondary/40"
                  }`}
                  style={{ height: `${6 + Math.min(volume * 260, 54) * mult}px` }}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-red" />
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-content-primary">
                {fmt(seconds)}
              </span>
            </div>

            <p className="text-xs text-content-secondary">
              {hasSpokenRef.current
                ? "Listening… stops automatically when you finish."
                : "Start speaking now…"}
            </p>

            <button
              onClick={stopRecording}
              className="rounded-full border border-border bg-bg-tertiary px-5 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-secondary hover:text-content-primary"
            >
              Done — stop answering
            </button>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm font-medium">Saving your answer…</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {getPhaseUI()}
      {error && (
        <div className="text-center">
          <p className="text-sm text-accent-red">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setPhase("listening");
            }}
            className="mt-2 text-xs text-accent underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
