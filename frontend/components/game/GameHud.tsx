"use client";

import { Heart, Flame } from "lucide-react";

interface Props {
  lives: number;
  maxLives: number;
  combo: number;
  xp: number;
  progress: number; // 0-100, question progress through the round
  accentText?: string; // tailwind text color class for xp/combo
}

export function GameHud({ lives, maxLives, combo, xp, progress, accentText = "text-accent" }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {Array.from({ length: maxLives }).map((_, i) => (
            <Heart
              key={i}
              className={`h-5 w-5 transition-colors ${i < lives ? "fill-accent-red text-accent-red" : "text-border"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold">
          {combo > 1 && (
            <span className="flex items-center gap-1 text-accent-yellow">
              <Flame className="h-4 w-4" /> x{combo}
            </span>
          )}
          <span className={accentText}>{xp} XP</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
