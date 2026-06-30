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
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
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

    const SPEECH_THRESHOLD = 0.008;
    const SILENCE_TIMEOUT = 3000; // 3 seconds of silence = stop

    if (rms > SPEECH_THRESHOLD) {
      hasSpokenRef.current = true;
      silenceStartRef.current = null;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    } else if (hasSpokenRef.current && !silenceStartRef.current) {
      silenceStartRef.current = Date.now();
      silenceTimerRef.current = setTimeout(() => {
        stopRecording();
      }, SILENCE_TIMEOUT);
    }

    rafRef.current = requestAnimationFrame(monitorVolume);
  };

  const startRecording = useCallback(async () => {
    setError(null);
    setPhase("recording");
    setSeconds(0);
    hasSpokenRef.current = false;
    silenceStartRef.current = null;

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

  // Auto-start recording after a brief delay
  useEffect(() => {
    if (phase === "listening") {
      const timer = setTimeout(() => {
        startRecording();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [phase, startRecording]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // Phase indicator UI
  const getPhaseUI = () => {
    switch (phase) {
      case "listening":
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <Mic className="h-10 w-10 text-accent-yellow animate-bounce" />
            <p className="text-lg font-medium text-accent-yellow">Get Ready...</p>
            <p className="text-sm text-content-secondary">Recording will start automatically in a moment</p>
          </div>
        );
      case "recording":
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="relative">
              <Mic className="h-12 w-12 text-accent-red animate-pulse" />
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-red text-[10px] font-bold text-white">
                REC
              </span>
            </div>
            <p className="text-lg font-medium text-accent-red">Recording...</p>
            <p className="text-sm text-content-secondary">
              {hasSpokenRef.current
                ? "Speaking detected. Will auto-stop after 2.5s of silence."
                : "Start speaking now..."}
            </p>
            <span className="font-mono text-2xl tabular-nums text-accent-red">
              {fmt(seconds)}
            </span>
            {/* Volume visualizer */}
            <div className="h-2 w-48 overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(volume * 2000, 100)}%` }}
              />
            </div>
            <button
              onClick={stopRecording}
              className="mt-2 rounded-full border border-border bg-bg-tertiary px-4 py-2 text-xs text-content-secondary hover:bg-bg-secondary"
            >
              Stop manually
            </button>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
            <p className="text-lg font-medium">Processing your answer...</p>
            <p className="text-sm text-content-secondary">AI is transcribing and evaluating</p>
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
