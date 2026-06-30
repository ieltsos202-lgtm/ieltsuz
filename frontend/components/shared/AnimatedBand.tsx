"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

function bandColor(score: number): string {
  if (score >= 7) return "text-accent-green";
  if (score >= 6) return "text-accent";
  if (score >= 5) return "text-accent-yellow";
  return "text-accent-red";
}

export function AnimatedBand({
  target,
  className,
  duration = 1500,
}: {
  target: number;
  className?: string;
  duration?: number;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(eased * target);
      if (t < 1) frame = requestAnimationFrame(animate);
      else setValue(target);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return (
    <span className={cn("font-extrabold tabular-nums", bandColor(target), className)}>
      {value.toFixed(1)}
    </span>
  );
}
