"use client";

/**
 * Shared "game juice" components — the visual reward layer every mini-game
 * reuses: animated backgrounds, combo popups, counting XP, breaking hearts,
 * tense timer bars, 3D level badges and full-screen celebrations.
 *
 * Everything is transform/opacity-based (GPU-accelerated) via framer-motion —
 * no layout thrash, safe on mid-range mobile.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { Heart, Flame, Star, Zap } from "lucide-react";

// ---------- Animated game background ----------

const BG_COLORS: Record<string, [string, string, string]> = {
  orange: ["#f59e0b", "#ef4444", "#fb923c"],
  purple: ["#8b5cf6", "#6366f1", "#a855f7"],
  teal: ["#10b981", "#06b6d4", "#34d399"],
};

/**
 * Slowly-shifting gradient mesh + drifting glow orbs. `intensity` (0-1, feed
 * it the combo) makes the mesh faster and more saturated as streaks grow.
 */
export function GameBackground({
  palette,
  intensity = 0,
}: {
  palette: "orange" | "purple" | "teal";
  intensity?: number;
}) {
  const [c1, c2, c3] = BG_COLORS[palette];
  const speed = 14 - intensity * 8; // seconds per loop — faster when hot
  const glow = 0.10 + intensity * 0.14;

  const orbs = useMemo(
    () =>
      Array.from({ length: 5 }).map((_, i) => ({
        id: i,
        left: `${8 + i * 20 + Math.random() * 8}%`,
        size: 140 + Math.random() * 160,
        dur: 9 + Math.random() * 8,
        delay: -Math.random() * 10,
        color: [c1, c2, c3][i % 3],
      })),
    [c1, c2, c3]
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* base gradient wash */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            `radial-gradient(120% 90% at 20% 10%, ${c1}${Math.round(glow * 255).toString(16).padStart(2, "0")} 0%, transparent 60%), radial-gradient(100% 80% at 85% 85%, ${c2}${Math.round(glow * 255).toString(16).padStart(2, "0")} 0%, transparent 55%)`,
            `radial-gradient(120% 90% at 80% 15%, ${c3}${Math.round(glow * 255).toString(16).padStart(2, "0")} 0%, transparent 60%), radial-gradient(100% 80% at 15% 90%, ${c1}${Math.round(glow * 255).toString(16).padStart(2, "0")} 0%, transparent 55%)`,
          ],
        }}
        transition={{ duration: speed, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      {/* drifting orbs */}
      {orbs.map((o) => (
        <motion.div
          key={o.id}
          className="absolute rounded-full blur-3xl"
          style={{
            left: o.left,
            width: o.size,
            height: o.size,
            backgroundColor: o.color,
            opacity: 0.05 + intensity * 0.06,
          }}
          animate={{ y: ["-15%", "115%"], x: [0, 30, -20, 0] }}
          transition={{ duration: o.dur - intensity * 3, repeat: Infinity, delay: o.delay, ease: "linear" }}
        />
      ))}
    </div>
  );
}

// ---------- Combo burst ----------

/** "x3 COMBO!" spring popup — fires whenever `combo` increases past 1. */
export function ComboBurst({ combo }: { combo: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (combo > 1) setShown(combo);
  }, [combo]);
  return (
    <div className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2">
      <AnimatePresence>
        {shown > 1 && (
          <motion.div
            key={shown}
            initial={{ scale: 0.3, y: 14, opacity: 0, rotate: -6 }}
            animate={{ scale: [0.3, 1.35, 1], y: 0, opacity: [0, 1, 1, 0], rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, times: [0, 0.25, 0.7, 1], ease: "easeOut" }}
            onAnimationComplete={() => setShown(0)}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-yellow to-accent-red px-4 py-1.5 text-lg font-extrabold text-white shadow-lg shadow-accent-yellow/40"
          >
            <Flame className="h-5 w-5" /> x{shown} combo!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- XP counter ----------

/** Animated count-up + a flying "+N" popup each time xp increases. */
export function XPCounter({ xp, className = "" }: { xp: number; className?: string }) {
  const spring = useSpring(xp, { stiffness: 120, damping: 18 });
  const display = useTransform(spring, (v) => Math.round(v).toString());
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null);
  const prevRef = useRef(xp);

  useEffect(() => {
    const diff = xp - prevRef.current;
    prevRef.current = xp;
    spring.set(xp);
    if (diff > 0) setGain({ amount: diff, key: Date.now() });
  }, [xp, spring]);

  return (
    <span className={`relative inline-flex items-center gap-1 font-semibold ${className}`}>
      <Zap className="h-4 w-4" />
      <motion.span>{display}</motion.span>
      <span>XP</span>
      <AnimatePresence>
        {gain && (
          <motion.span
            key={gain.key}
            initial={{ opacity: 0, y: 4, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -26, scale: [0.6, 1.15, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            onAnimationComplete={() => setGain(null)}
            className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-accent-green"
          >
            +{gain.amount}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ---------- Hearts ----------

/** Hearts that pop/break when lost — pass `lives`; lost hearts shatter. */
export function HeartsDisplay({ lives, maxLives = 3 }: { lives: number; maxLives?: number }) {
  const prevRef = useRef(lives);
  const [lostAt, setLostAt] = useState(0);
  useEffect(() => {
    if (lives < prevRef.current) setLostAt(Date.now());
    prevRef.current = lives;
  }, [lives]);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: maxLives }).map((_, i) => {
        const alive = i < lives;
        const justLost = !alive && i === lives && Date.now() - lostAt < 900;
        return (
          <motion.span
            key={`${i}-${alive ? "a" : "d"}`}
            animate={
              justLost
                ? { scale: [1, 1.5, 0.6], rotate: [0, -18, 12, 0], opacity: [1, 1, 0.35] }
                : alive
                ? { scale: [0.8, 1.15, 1] }
                : {}
            }
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-block"
          >
            <Heart
              className={`h-5 w-5 ${
                alive ? "fill-accent-red text-accent-red drop-shadow-[0_0_6px_rgba(248,113,113,0.5)]" : "text-border"
              }`}
            />
          </motion.span>
        );
      })}
    </div>
  );
}

// ---------- Timer bar ----------

/** Green → yellow → red tension bar with a pulse in the final stretch. */
export function TimerBar({ ratio, dangerBelow = 0.3 }: { ratio: number; dangerBelow?: number }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const danger = ratio <= dangerBelow;
  const color =
    ratio > 0.55 ? "from-accent-green to-emerald-400" : ratio > dangerBelow ? "from-accent-yellow to-amber-400" : "from-accent-red to-rose-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary/80">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${color}`}
        style={{ width: `${pct}%` }}
        animate={danger ? { opacity: [1, 0.45, 1] } : { opacity: 1 }}
        transition={danger ? { duration: 0.5, repeat: Infinity } : { duration: 0.15 }}
      />
    </div>
  );
}

// ---------- 3D level badge ----------

/** Spinning CEFR badge that flips in when a new word appears. */
export function LevelBadge({ label }: { label: string }) {
  return (
    <motion.span
      key={label}
      initial={{ rotateY: 90, scale: 0.5, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 16 }}
      style={{ transformStyle: "preserve-3d", display: "inline-block" }}
      className="rounded-lg border border-accent-yellow/50 bg-gradient-to-br from-accent-yellow/25 to-accent-red/20 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-accent-yellow shadow-[0_4px_14px_rgba(251,191,36,0.25)]"
    >
      {label}
    </motion.span>
  );
}

// ---------- Option button ----------

const OPTION_STYLES = [
  "border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20 shadow-sky-500/10",
  "border-fuchsia-400/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 shadow-fuchsia-500/10",
  "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 shadow-amber-500/10",
  "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20 shadow-emerald-500/10",
];

/**
 * A tactile answer button: distinct colour per slot, soft 3D elevation,
 * spring press, and correct/wrong flash states.
 */
export function OptionButton({
  index,
  text,
  state,
  disabled,
  onClick,
}: {
  index: number;
  text: string;
  state: "idle" | "correct" | "wrong";
  disabled: boolean;
  onClick: () => void;
}) {
  const base = OPTION_STYLES[index % OPTION_STYLES.length];
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.03, y: -2, rotate: index % 2 ? 0.6 : -0.6 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      animate={
        state === "correct"
          ? { scale: [1, 1.08, 1], boxShadow: "0 0 24px rgba(52,211,153,0.45)" }
          : state === "wrong"
          ? { x: [0, -7, 7, -5, 5, 0] }
          : {}
      }
      transition={state === "wrong" ? { duration: 0.4 } : { type: "spring", stiffness: 320, damping: 15 }}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-md backdrop-blur-sm transition-colors ${
        state === "correct"
          ? "border-accent-green bg-accent-green/20 text-accent-green"
          : state === "wrong"
          ? "border-accent-red bg-accent-red/20 text-accent-red"
          : `${base} text-content-primary`
      }`}
    >
      {text}
    </motion.button>
  );
}

// ---------- Celebration overlay ----------

/**
 * Full-screen celebration: level-up, tier-up or board-complete. `tier` set ⇒
 * the bigger "new tier" variant with a name reveal.
 */
export function CelebrationOverlay({
  show,
  title,
  subtitle,
  tierName,
  onDone,
  durationMs = 2200,
}: {
  show: boolean;
  title: string;
  subtitle?: string;
  tierName?: string | null;
  onDone?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!show || !onDone) return;
    const t = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(t);
  }, [show, onDone, durationMs]);

  const pieces = useMemo(
    () =>
      Array.from({ length: tierName ? 42 : 26 }).map((_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 320,
        y: -(60 + Math.random() * 260),
        r: Math.random() * 540 - 270,
        c: ["#fbbf24", "#f87171", "#34d399", "#818cf8", "#f472b6", "#38bdf8"][i % 6],
        s: 6 + Math.random() * 8,
        d: 1 + Math.random() * 0.7,
      })),
    [tierName]
  );

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          {/* confetti rain from the banner */}
          <div className="pointer-events-none absolute left-1/2 top-1/3">
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: p.x, y: [0, p.y, 320], opacity: [1, 1, 0], rotate: p.r }}
                transition={{ duration: p.d + 0.9, ease: "easeOut" }}
                className="absolute rounded-sm"
                style={{ width: p.s, height: p.s * 0.6, backgroundColor: p.c }}
              />
            ))}
          </div>

          <motion.div
            initial={{ scale: 0.4, y: 40, opacity: 0 }}
            animate={{ scale: [0.4, 1.12, 1], y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="relative mx-4 rounded-3xl border border-accent-yellow/40 bg-bg-secondary/95 px-10 py-8 text-center shadow-2xl shadow-accent-yellow/20"
          >
            <motion.div
              animate={{ rotate: [0, -12, 12, -8, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.8, delay: 0.15 }}
            >
              <Star className="mx-auto h-14 w-14 fill-accent-yellow text-accent-yellow drop-shadow-[0_0_18px_rgba(251,191,36,0.6)]" />
            </motion.div>
            <h2 className="mt-3 bg-gradient-to-r from-accent-yellow via-accent-red to-accent-purple bg-clip-text text-3xl font-extrabold text-transparent">
              {title}
            </h2>
            {tierName && (
              <motion.p
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, type: "spring", stiffness: 240 }}
                className="mt-2 text-lg font-bold text-accent-yellow"
              >
                {tierName}
              </motion.p>
            )}
            {subtitle && <p className="mt-1 text-sm text-content-secondary">{subtitle}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
