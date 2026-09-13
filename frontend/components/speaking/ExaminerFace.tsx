"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StudioEmotion, StudioPhase } from "./LiveExaminerStudio";

/** Five visual moods (reference design): angry, happy, sad, surprised, thinking */
type Mood = "angry" | "happy" | "sad" | "surprised" | "thinking";

const MOOD_OF: Record<StudioEmotion, Mood> = {
  happy: "happy",
  laughing: "happy",
  excited: "happy",
  encouraging: "happy",
  neutral: "happy",
  annoyed: "angry",
  sad: "sad",
  surprised: "surprised",
  thinking: "thinking",
};

const INK = "#4a2c17";
const GOLD_GLOW: Record<Mood, string> = {
  angry: "rgba(239,68,68,0.55)",
  happy: "rgba(245,179,74,0.45)",
  sad: "rgba(96,165,250,0.4)",
  surprised: "rgba(250,204,21,0.45)",
  thinking: "rgba(196,181,253,0.4)",
};

const spring = { type: "spring", stiffness: 260, damping: 20 } as const;

export function ExaminerFace({
  phase,
  emotion,
  micLevel = 0,
  size = 240,
}: {
  phase: StudioPhase;
  emotion: StudioEmotion;
  micLevel?: number;
  size?: number;
}) {
  const mood: Mood = phase === "thinking" ? "thinking" : MOOD_OF[emotion];
  const laughing = emotion === "laughing" || emotion === "excited";
  const calm = emotion === "neutral" && phase !== "thinking";
  const [blink, setBlink] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 110);
        loop();
      }, 2400 + Math.random() * 2600);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "speaking") {
      setMouthOpen(0);
      return;
    }
    const id = setInterval(() => setMouthOpen(0.25 + Math.random() * 0.75), 110);
    return () => clearInterval(id);
  }, [phase]);

  const listenScale = phase === "listening" ? 1 + Math.min(micLevel * 1.6, 0.1) : 1;
  const speaking = phase === "speaking";

  // ---------- mouth paths per mood ----------
  const mouthPath = (() => {
    if (speaking) {
      const o = mouthOpen;
      if (mood === "angry") return `M 72 138 Q 100 ${128 + 10 * o} 128 138 Q 100 ${138 + 22 * o} 72 138 Z`;
      if (mood === "sad") return `M 74 140 Q 100 ${122 + 8 * o} 126 140 Q 100 ${140 + 20 * o} 74 140 Z`;
      if (mood === "surprised") return `M 88 128 Q 100 ${118 - 4 * o} 112 128 Q 100 ${138 + 20 * o} 88 128 Z`;
      if (mood === "thinking") return `M 82 136 Q 100 ${130 + 6 * o} 118 134 Q 100 ${138 + 18 * o} 82 136 Z`;
      return `M 66 124 Q 100 ${124 + 8 * o} 134 124 Q 100 ${136 + 36 * o} 66 124 Z`;
    }
    switch (mood) {
      case "angry":
        return "M 74 140 Q 100 126 126 140";
      case "sad":
        return "M 72 142 Q 100 118 128 142";
      case "surprised":
        return "M 88 128 Q 100 116 112 128 Q 100 146 88 128 Z";
      case "thinking":
        return "M 82 134 Q 100 128 118 132";
      default:
        return calm ? "M 70 124 Q 100 146 130 124" : "M 62 120 Q 100 128 138 120 Q 100 170 62 120 Z";
    }
  })();
  const mouthFilled = speaking || mood === "surprised" || (mood === "happy" && !calm);

  // ---------- brows ----------
  const brows = {
    angry: { l: { rotate: 22, y: 10 }, r: { rotate: -22, y: 10 } },
    happy: { l: { rotate: -6, y: -4 }, r: { rotate: 6, y: -4 } },
    sad: { l: { rotate: 14, y: -2 }, r: { rotate: -14, y: -2 } },
    surprised: { l: { rotate: -4, y: -14 }, r: { rotate: 4, y: -14 } },
    thinking: { l: { rotate: 4, y: 2 }, r: { rotate: -10, y: -10 } },
  }[mood];

  // ---------- eyes ----------
  const eyeMode: "arc" | "open" | "angry" | "wide" | "teary" =
    mood === "happy" && !calm ? "arc" : mood === "angry" ? "angry" : mood === "surprised" ? "wide" : mood === "sad" ? "teary" : "open";

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      animate={
        speaking && mood === "angry"
          ? { x: [0, -3, 3, -2, 2, 0], rotate: [0, -1.5, 1.5, -1, 1, 0] }
          : speaking && laughing
          ? { y: [0, -6, 0], rotate: [0, -2, 2, 0] }
          : speaking && mood === "sad"
          ? { y: [0, 3, 0] }
          : { x: 0, y: 0, rotate: 0 }
      }
      transition={
        speaking
          ? { duration: mood === "angry" ? 0.45 : 1.6, repeat: Infinity, repeatDelay: mood === "angry" ? 0.7 : 0 }
          : { duration: 0.3 }
      }
    >
      {/* Glow */}
      <motion.div
        className="absolute inset-0 rounded-full blur-3xl"
        animate={{ backgroundColor: GOLD_GLOW[mood], scale: speaking ? [1, 1.15, 1] : 1 }}
        transition={{ backgroundColor: { duration: 0.6 }, scale: speaking ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 } }}
      />

      <motion.svg
        viewBox="0 0 200 200"
        className="relative h-full w-full overflow-visible drop-shadow-2xl"
        animate={{ scale: listenScale }}
        transition={{ duration: 0.12 }}
      >
        <defs>
          <radialGradient id="ringGrad" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#f6d38a" />
            <stop offset="45%" stopColor="#d9a24e" />
            <stop offset="100%" stopColor="#8a5a1c" />
          </radialGradient>
          <radialGradient id="faceGrad" cx="40%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f1f2f5" />
            <stop offset="100%" stopColor="#cfd3db" />
          </radialGradient>
          <linearGradient id="fireGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff4d1f" />
            <stop offset="55%" stopColor="#ff9a1f" />
            <stop offset="100%" stopColor="#ffe36b" />
          </linearGradient>
          <linearGradient id="fireCore" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffb13b" />
            <stop offset="100%" stopColor="#fff7c2" />
          </linearGradient>
        </defs>

        {/* ---- FIRE (angry) ---- */}
        <AnimatePresence>
          {mood === "angry" && (
            <motion.g
              key="fire"
              initial={{ opacity: 0, scale: 0.4, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.4, y: 20 }}
              transition={spring}
              style={{ originX: "100px", originY: "40px" }}
            >
              {[
                { x: 72, s: 0.85, d: 0 },
                { x: 100, s: 1.15, d: 0.15 },
                { x: 128, s: 0.9, d: 0.3 },
              ].map((f, i) => (
                <motion.g
                  key={i}
                  style={{ originX: `${f.x}px`, originY: "44px" }}
                  animate={
                    speaking
                      ? { scaleY: [f.s, f.s * 1.25, f.s * 0.95, f.s], scaleX: [1, 0.92, 1.06, 1], y: [0, -3, 1, 0] }
                      : { scaleY: f.s, scaleX: 1, y: 0 }
                  }
                  transition={speaking ? { duration: 0.55, repeat: Infinity, delay: f.d, ease: "easeInOut" } : { duration: 0.3 }}
                >
                  <path
                    d={`M ${f.x} 44 C ${f.x - 22} 30 ${f.x - 16} 8 ${f.x - 4} -6 C ${f.x - 2} 4 ${f.x + 6} 6 ${f.x + 4} -10 C ${f.x + 18} 6 ${f.x + 22} 30 ${f.x} 44 Z`}
                    fill="url(#fireGrad)"
                  />
                  <path
                    d={`M ${f.x} 42 C ${f.x - 10} 32 ${f.x - 8} 20 ${f.x} 10 C ${f.x + 8} 20 ${f.x + 10} 32 ${f.x} 42 Z`}
                    fill="url(#fireCore)"
                    opacity={0.9}
                  />
                </motion.g>
              ))}
            </motion.g>
          )}
        </AnimatePresence>

        {/* ---- THOUGHT CLOUD (thinking) ---- */}
        <AnimatePresence>
          {mood === "thinking" && (
            <motion.g
              key="cloud"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={spring}
              style={{ originX: "168px", originY: "30px" }}
            >
              <circle cx="150" cy="58" r="4" fill="#e7e0d3" opacity="0.8" />
              <circle cx="158" cy="47" r="6" fill="#e7e0d3" opacity="0.9" />
              <g>
                <ellipse cx="176" cy="28" rx="22" ry="14" fill="#e7e0d3" />
                <circle cx="164" cy="22" r="11" fill="#e7e0d3" />
                <circle cx="182" cy="17" r="12" fill="#e7e0d3" />
                <circle cx="194" cy="28" r="9" fill="#e7e0d3" />
                <ellipse cx="176" cy="30" rx="16" ry="8" fill="#f8f4ec" />
                {[0, 1, 2].map((i) => (
                  <motion.circle
                    key={i}
                    cx={168 + i * 8}
                    cy="29"
                    r="2.2"
                    fill={INK}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }}
                  />
                ))}
              </g>
            </motion.g>
          )}
        </AnimatePresence>

        {/* ---- RING + FACE ---- */}
        <circle cx="100" cy="100" r="92" fill="url(#ringGrad)" />
        <circle cx="100" cy="100" r="92" fill="none" stroke="#6b4415" strokeWidth="1.5" opacity="0.6" />
        <circle cx="100" cy="100" r="76" fill="url(#faceGrad)" />
        <circle cx="100" cy="100" r="76" fill="none" stroke="#b8862f" strokeWidth="1.2" opacity="0.5" />
        {/* soft inner shadow */}
        <circle cx="100" cy="104" r="76" fill="none" stroke="#000" strokeWidth="6" opacity="0.06" />

        {/* Angry red flush */}
        <motion.circle cx="100" cy="100" r="76" fill="#ef4444" animate={{ opacity: mood === "angry" ? 0.22 : 0 }} transition={{ duration: 0.5 }} />
        {/* Sad blue tint */}
        <motion.circle cx="100" cy="100" r="76" fill="#60a5fa" animate={{ opacity: mood === "sad" ? 0.08 : 0 }} transition={{ duration: 0.5 }} />

        {/* ---- BROWS ---- */}
        <motion.path
          d="M 58 72 Q 72 62 86 70"
          stroke={INK}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          style={{ originX: "72px", originY: "68px" }}
          animate={{ rotate: brows.l.rotate, y: brows.l.y }}
          transition={spring}
        />
        <motion.path
          d="M 114 70 Q 128 62 142 72"
          stroke={INK}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          style={{ originX: "128px", originY: "68px" }}
          animate={{ rotate: brows.r.rotate, y: brows.r.y }}
          transition={spring}
        />

        {/* ---- EYES ---- */}
        {(["l", "r"] as const).map((side) => {
          const cx = side === "l" ? 72 : 128;
          const scaleY = blink ? 0.08 : 1;
          return (
            <motion.g
              key={side}
              style={{ originX: `${cx}px`, originY: "96px" }}
              animate={{ scaleY }}
              transition={{ duration: blink ? 0.06 : 0.2 }}
            >
              {eyeMode === "arc" && (
                <motion.path
                  d={`M ${cx - 14} 100 Q ${cx} 80 ${cx + 14} 100`}
                  stroke={INK}
                  strokeWidth="7"
                  strokeLinecap="round"
                  fill="none"
                  initial={false}
                  animate={{ scale: laughing && speaking ? [1, 1.08, 1] : 1 }}
                  transition={laughing && speaking ? { duration: 0.4, repeat: Infinity } : { duration: 0.2 }}
                />
              )}
              {eyeMode === "angry" && (
                <>
                  <path
                    d={
                      side === "l"
                        ? `M ${cx - 14} 92 L ${cx + 12} 100 L ${cx + 12} 104 L ${cx - 14} 104 Z`
                        : `M ${cx + 14} 92 L ${cx - 12} 100 L ${cx - 12} 104 L ${cx + 14} 104 Z`
                    }
                    fill={INK}
                  />
                  <circle cx={cx + (side === "l" ? 3 : -3)} cy="98" r="3" fill="#fff" opacity="0.9" />
                </>
              )}
              {eyeMode === "wide" && (
                <motion.g animate={{ scale: speaking ? [1, 1.08, 1] : 1 }} transition={speaking ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }} style={{ originX: `${cx}px`, originY: "96px" }}>
                  <circle cx={cx} cy="96" r="13" fill="none" stroke={INK} strokeWidth="5" />
                  <circle cx={cx} cy="96" r="6" fill={INK} />
                  <circle cx={cx + 2.5} cy="93" r="2" fill="#fff" />
                </motion.g>
              )}
              {eyeMode === "teary" && (
                <>
                  <circle cx={cx} cy="98" r="12" fill={INK} />
                  <circle cx={cx - 4} cy="93" r="4" fill="#fff" />
                  <circle cx={cx + 5} cy="102" r="2" fill="#fff" opacity="0.7" />
                  <motion.path
                    d={`M ${cx + (side === "l" ? -16 : 16)} 106 Q ${cx + (side === "l" ? -20 : 20)} 116 ${cx + (side === "l" ? -16 : 16)} 122 Q ${cx + (side === "l" ? -12 : 12)} 116 ${cx + (side === "l" ? -16 : 16)} 106 Z`}
                    fill="#7dd3fc"
                    animate={speaking ? { y: [0, 10, 22], opacity: [0, 1, 0] } : { y: 4, opacity: 0.9 }}
                    transition={speaking ? { duration: 1.6, repeat: Infinity, delay: side === "l" ? 0 : 0.8 } : { duration: 0.2 }}
                  />
                </>
              )}
              {eyeMode === "open" && (
                <>
                  <ellipse cx={cx} cy="96" rx="9" ry="10" fill={INK} />
                  <circle cx={cx + 3} cy="92" r="2.5" fill="#fff" />
                </>
              )}
            </motion.g>
          );
        })}

        {/* ---- MOUTH ---- */}
        <motion.path
          animate={{ d: mouthPath }}
          transition={{ duration: speaking ? 0.08 : 0.3 }}
          fill={mouthFilled ? INK : "none"}
          stroke={INK}
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* tongue when laughing */}
        {mood === "happy" && !calm && !speaking && (
          <path d="M 84 148 Q 100 162 116 148 Q 100 140 84 148 Z" fill="#e0715f" opacity="0.9" />
        )}

        {/* ---- HAND ON CHIN (thinking) ---- */}
        <AnimatePresence>
          {mood === "thinking" && (
            <motion.g
              key="hand"
              initial={{ opacity: 0, y: 30, x: 10 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={spring}
            >
              <path
                d="M 118 168 Q 150 150 168 158 Q 176 164 168 172 Q 140 182 118 176 Z"
                fill="#e2a85c"
                stroke="#a86b23"
                strokeWidth="2"
              />
              <path d="M 124 154 Q 130 140 138 150 Q 140 160 130 162 Z" fill="#e2a85c" stroke="#a86b23" strokeWidth="2" />
              {[0, 1, 2].map((i) => (
                <path
                  key={i}
                  d={`M ${138 + i * 10} ${162 + i * 3} q 10 -4 14 3 q -4 6 -14 3 Z`}
                  fill="#e2a85c"
                  stroke="#a86b23"
                  strokeWidth="1.5"
                />
              ))}
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>

      {/* Listening waveform ring */}
      {phase === "listening" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {Array.from({ length: 18 }).map((_, i) => {
            const angle = (i / 18) * 360;
            const h = 8 + Math.min(micLevel * 280, 40) * (0.5 + Math.abs(Math.sin(i * 1.3)) * 0.5);
            return (
              <div
                key={i}
                className="absolute w-1.5 origin-bottom rounded-full bg-amber-300/80"
                style={{
                  height: h,
                  transform: `rotate(${angle}deg) translateY(-${size / 2 + 12}px)`,
                  transition: "height 70ms ease-out",
                }}
              />
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
