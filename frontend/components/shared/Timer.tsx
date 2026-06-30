"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function format(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function Timer({
  seconds,
  running = true,
  onElapsed,
}: {
  seconds: number;
  running?: boolean;
  onElapsed?: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      onElapsed?.();
      return;
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [running, remaining, onElapsed]);

  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-bg-tertiary px-4 py-2 font-mono text-content-primary">
      <Clock className="h-4 w-4 text-accent" />
      {format(remaining)}
    </div>
  );
}
