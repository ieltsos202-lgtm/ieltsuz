"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Play, Pause, Volume2 } from "lucide-react";

export interface AudioPlayerHandle {
  seek: (seconds: number) => void;
}

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

const SPEEDS = [0.75, 1, 1.25];

export const AudioPlayer = forwardRef<AudioPlayerHandle, { src: string; onEnded?: () => void }>(
  function AudioPlayer({ src, onEnded }, ref) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [volume, setVolume] = useState(1);

    useImperativeHandle(ref, () => ({
      seek: (seconds: number) => {
        if (audioRef.current) {
          audioRef.current.currentTime = seconds;
          audioRef.current.play();
          setPlaying(true);
        }
      },
    }));

    const toggle = () => {
      const a = audioRef.current;
      if (!a) return;
      if (playing) a.pause();
      else a.play();
      setPlaying(!playing);
    };

    const setRate = (r: number) => {
      setSpeed(r);
      if (audioRef.current) audioRef.current.playbackRate = r;
    };

    return (
      <div className="space-y-3 rounded-[var(--radius)] border border-border bg-bg-tertiary p-4">
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => {
            setPlaying(false);
            onEnded?.();
          }}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent/90"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={current}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCurrent(v);
              if (audioRef.current) audioRef.current.currentTime = v;
            }}
            className="h-1.5 flex-1 cursor-pointer accent-[#6366F1]"
          />
          <span className="w-24 text-right font-mono text-xs text-content-secondary">
            {fmt(current)} / {fmt(duration)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {SPEEDS.map((r) => (
              <button
                key={r}
                onClick={() => setRate(r)}
                className={`rounded px-2 py-1 text-xs ${
                  speed === r ? "bg-accent text-white" : "text-content-secondary hover:bg-bg-secondary"
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-content-secondary" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
              className="h-1.5 w-24 cursor-pointer accent-[#6366F1]"
            />
          </div>
        </div>
      </div>
    );
  }
);
