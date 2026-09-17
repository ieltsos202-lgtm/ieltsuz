"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Rocket, Check, X } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { GameSummary } from "@/components/game/GameSummary";
import { ConfettiBurst } from "@/components/game/ConfettiBurst";
import {
  GameBackground,
  ComboBurst,
  XPCounter,
  HeartsDisplay,
  OptionButton,
  CelebrationOverlay,
} from "@/components/game/juice";
import { calcAnswerXp, difficultyColor } from "@/lib/gameEngine";
import { wordDropDifficulty, crossedTier, tierForLevel } from "@/lib/leveling";
import type { GameMasterItem, GameFinishResult, GameStats } from "@/lib/types";

interface Question {
  item: GameMasterItem;
  options: string[];
  answer: string;
}

const DANGER_LINE_PCT = 82;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(items: GameMasterItem[], count: number, tricky: boolean): Question[] {
  const pool = items.filter((i) => i.translation);
  const qs: Question[] = [];
  for (const item of pool) {
    const sameTier = pool.filter((i) => i.id !== item.id && i.difficulty === item.difficulty);
    const others = pool.filter((i) => i.id !== item.id && i.difficulty !== item.difficulty);
    const distractorPool = tricky && sameTier.length >= 3 ? sameTier : [...sameTier, ...others];
    const distractors = shuffle(distractorPool).slice(0, 3).map((i) => i.translation!) as string[];
    if (distractors.length < 3) continue;
    qs.push({ item, answer: item.translation!, options: shuffle([item.translation!, ...distractors]) });
  }
  return shuffle(qs).slice(0, count);
}

/** Soft parallax blobs drifting upward — sells the "falling" sensation. */
function ParallaxField({ intensity }: { intensity: number }) {
  const blobs = Array.from({ length: 8 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((_, i) => {
        const depth = (i % 3) + 1; // 1 = far/slow, 3 = near/fast
        const size = 30 + depth * 26;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-accent-green/10 blur-xl"
            style={{ width: size, height: size, left: `${(i * 13 + 5) % 95}%` }}
            animate={{ y: ["110%", "-20%"] }}
            transition={{
              duration: (14 - depth * 3) / (1 + intensity * 0.8),
              repeat: Infinity,
              ease: "linear",
              delay: -i * 1.7,
            }}
          />
        );
      })}
    </div>
  );
}

export default function WordDropPage() {
  const [phase, setPhase] = useState<"loading" | "playing" | "finishing" | "summary" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameKey, setGameKey] = useState(0);

  const [level, setLevel] = useState(1);
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [fallTime, setFallTime] = useState(6);
  const [timeLeft, setTimeLeft] = useState(6);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const [caught, setCaught] = useState(false);
  const [result, setResult] = useState<GameFinishResult | null>(null);
  const [burst, setBurst] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [celebrate, setCelebrate] = useState<null | { title: string; tier?: string }>(null);
  const timerRef = useRef<number | null>(null);

  const diff = wordDropDifficulty(level);

  useEffect(() => {
    setPhase("loading");
    setIndex(0);
    setLives(3);
    setCombo(0);
    setBestCombo(0);
    setXp(0);
    setCorrect(0);
    Promise.all([
      apiGet<{ items: GameMasterItem[] }>("/api/game/pool?items=50"),
      apiGet<GameStats>("/api/game/stats").catch(() => null),
    ])
      .then(([res, stats]) => {
        const lvl = stats?.level ?? 1;
        setLevel(lvl);
        const d = wordDropDifficulty(lvl);
        const qs = buildQuestions(res.items, d.questions, d.trickyDistractors);
        if (qs.length === 0) throw new Error("Not enough vocabulary in the pool yet.");
        setQuestions(qs);
        setPhase("playing");
      })
      .catch((e) => {
        setError(e.message || "Could not load the game.");
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  const q = questions[index];

  useEffect(() => {
    if (!q || phase !== "playing") return;
    const ft = Math.max(diff.minFallSeconds, diff.fallSeconds - combo * diff.fallStep);
    setFallTime(ft);
    setTimeLeft(ft);
    setLocked(false);
    setChosen(null);
    setMissed(false);
    setCaught(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 0.05) {
          window.clearInterval(timerRef.current!);
          handleAnswer(null);
          return 0;
        }
        return t - 0.05;
      });
    }, 50);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase]);

  async function finish() {
    setPhase("finishing");
    if (timerRef.current) window.clearInterval(timerRef.current);
    try {
      const res = await apiPost<GameFinishResult>("/api/game/finish", {
        xpGained: xp,
        bestCombo,
        score: correct,
        game: "word-drop",
        learnedWords: questions.map((qq) => qq.item),
      });
      setResult(res);
      if (res.leveled_up) {
        const isTier = res.prev_level != null && crossedTier(res.prev_level, res.stats.level);
        setCelebrate({
          title: `Level ${res.stats.level}!`,
          tier: isTier ? `${tierForLevel(res.stats.level).name} tier unlocked` : undefined,
        });
      }
    } catch {
      setResult(null);
    }
    setPhase("summary");
  }

  function handleAnswer(choice: string | null) {
    if (locked || !q) return;
    setLocked(true);
    setChosen(choice);
    if (timerRef.current) window.clearInterval(timerRef.current);

    const isCorrect = choice != null && choice === q.answer;
    let newLives = lives;
    if (isCorrect) {
      setCaught(true);
      const gained = calcAnswerXp(combo, timeLeft / fallTime);
      setXp((x) => x + gained);
      setCombo((c) => {
        const next = c + 1;
        setBestCombo((b) => Math.max(b, next));
        return next;
      });
      setCorrect((c) => c + 1);
      setBurst(Date.now());
    } else {
      setMissed(true);
      setCombo(0);
      setShakeKey((k) => k + 1);
      newLives = lives - 1;
      setLives(newLives);
    }

    window.setTimeout(() => {
      if (!isCorrect && newLives <= 0) {
        finish();
        return;
      }
      if (index + 1 >= questions.length) {
        finish();
      } else {
        setIndex((i) => i + 1);
      }
    }, 850);
  }

  if (phase === "loading" || phase === "finishing") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <LoadingSpinner />
        <p className="text-sm text-content-secondary">{phase === "finishing" ? "Saving your progress…" : "Loading words…"}</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-content-secondary">{error}</p>
        <Link href="/game">
          <Button variant="gradient">Back to Games</Button>
        </Link>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <>
        <CelebrationOverlay
          show={!!celebrate}
          title={celebrate?.title || ""}
          tierName={celebrate?.tier}
          subtitle={celebrate?.tier ? "Faster drops, trickier words — good luck." : undefined}
          onDone={() => setCelebrate(null)}
          durationMs={celebrate?.tier ? 3000 : 2000}
        />
        <GameSummary
          correct={correct}
          total={questions.length}
          xpGained={xp}
          result={result}
          accent="from-accent-green to-accent"
          onReplay={() => {
            setResult(null);
            setCelebrate(null);
            setGameKey((k) => k + 1);
          }}
        />
      </>
    );
  }

  const fallPct = Math.max(0, Math.min(DANGER_LINE_PCT, (1 - timeLeft / fallTime) * DANGER_LINE_PCT));
  const comboIntensity = Math.min(1, combo / 8);
  const nearGround = fallPct > DANGER_LINE_PCT * 0.65;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <GameBackground palette="teal" intensity={comboIntensity} />

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Rocket className="h-5 w-5 text-accent-green" /> Word Drop
          <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-bold text-accent-green">
            Lv {level}
          </span>
        </h1>
        <Link href="/game">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Exit
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <HeartsDisplay lives={lives} maxLives={3} />
        <div className="flex items-center gap-3 text-sm font-semibold">
          {combo > 1 && (
            <motion.span key={combo} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-accent-yellow">
              x{combo}
            </motion.span>
          )}
          <XPCounter xp={xp} className="text-accent-green" />
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-green to-accent transition-all"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -9, 9, -7, 7, 0] } : {}}
        transition={{ duration: 0.45 }}
        className="relative h-64 overflow-hidden rounded-[var(--radius-lg)] border border-accent-green/30 bg-gradient-to-b from-bg-secondary/90 to-accent-green/10 shadow-xl shadow-accent-green/10 backdrop-blur-sm"
      >
        <ParallaxField intensity={comboIntensity} />
        <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-1/2" />
        <ComboBurst combo={combo} />

        {/* Catch zone — pulsing, brighter as the word approaches */}
        <motion.div
          className="absolute left-0 right-0 border-t-2 border-dashed"
          style={{ top: `${DANGER_LINE_PCT}%` }}
          animate={{
            borderColor: nearGround ? "rgba(248,113,113,0.9)" : "rgba(248,113,113,0.4)",
            boxShadow: nearGround
              ? "0 -6px 24px rgba(248,113,113,0.35)"
              : "0 -4px 14px rgba(248,113,113,0.12)",
          }}
          transition={{ duration: 0.3 }}
        />
        <motion.span
          className="absolute right-2 text-[10px] font-semibold uppercase tracking-wide text-accent-red/80"
          style={{ top: `${DANGER_LINE_PCT}%` }}
          animate={nearGround ? { opacity: [1, 0.4, 1] } : { opacity: 0.8 }}
          transition={nearGround ? { duration: 0.4, repeat: Infinity } : {}}
        >
          catch zone
        </motion.span>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{
              opacity: 1,
              scale: missed ? [1, 1.15, 0.85] : caught ? [1, 1.2, 0] : 1,
              y: caught ? [0, 30] : missed ? [0, -5, 0] : 0,
              rotate: missed ? 0 : [-4, 4, -4],
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              duration: caught ? 0.35 : 0.2,
              rotate: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
            }}
            className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ top: `${fallPct}%` }}
          >
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${difficultyColor(q.item.difficulty)}`}>
              {q.item.difficulty}
            </span>
            {/* Trailing glow behind the falling word */}
            <div className="relative">
              <motion.div
                className="absolute -inset-3 rounded-2xl bg-accent-green/25 blur-lg"
                animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              <span
                className={`relative rounded-xl border px-4 py-2 text-lg font-extrabold shadow-lg ${
                  locked
                    ? chosen === q.answer
                      ? "border-accent-green bg-accent-green/25 text-accent-green shadow-accent-green/40"
                      : "border-accent-red bg-accent-red/25 text-accent-red shadow-accent-red/40"
                    : "border-accent-green/50 bg-bg-primary text-content-primary shadow-accent-green/20"
                }`}
              >
                {q.item.word}
              </span>
            </div>
            {locked && (
              <span className="mt-1 flex items-center gap-1 text-xs font-semibold">
                {chosen === q.answer ? (
                  <>
                    <Check className="h-3 w-3 text-accent-green" /> <span className="text-accent-green">Caught!</span>
                  </>
                ) : (
                  <>
                    <X className="h-3 w-3 text-accent-red" /> <span className="text-accent-red">{q.answer}</span>
                  </>
                )}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const isAnswer = opt === q.answer;
          const isChosen = opt === chosen;
          const state = !locked ? "idle" : isAnswer ? "correct" : isChosen ? "wrong" : "idle";
          return (
            <OptionButton key={i} index={i} text={opt} state={state} disabled={locked} onClick={() => handleAnswer(opt)} />
          );
        })}
      </div>
    </div>
  );
}
