"use client";

import { motion, AnimatePresence } from "framer-motion";

const COLORS = ["#fbbf24", "#f87171", "#34d399", "#818cf8", "#f472b6", "#38bdf8"];
const PARTICLE_COUNT = 14;

interface Props {
  /** Increment this number every time you want to fire a fresh burst. 0/undefined renders nothing. */
  triggerKey: number;
  /** Positioning classes for the burst origin, relative to a `position: relative` parent. */
  originClassName?: string;
}

// Lightweight, dependency-free confetti burst used to celebrate correct
// answers / matches across the mini-games. Pure framer-motion, no canvas.
export function ConfettiBurst({ triggerKey, originClassName = "left-1/2 top-1/2" }: Props) {
  if (!triggerKey) return null;

  const particles = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 36 + Math.random() * 46;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 10,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 360 - 180,
      isCircle: i % 2 === 0,
    };
  });

  return (
    <div className={`pointer-events-none absolute ${originClassName} z-20`}>
      <AnimatePresence>
        <motion.div key={triggerKey} className="relative h-0 w-0">
          {particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
              animate={{ opacity: 0, x: p.x, y: p.y, scale: 0.4, rotate: p.rotate }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              className={`absolute h-2 w-2 ${p.isCircle ? "rounded-full" : "rounded-sm"}`}
              style={{ backgroundColor: p.color, left: 0, top: 0 }}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
