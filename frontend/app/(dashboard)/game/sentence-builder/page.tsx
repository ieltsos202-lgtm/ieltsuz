"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Rocket, Heart, Flame, Check, X } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { GameSummary } from "@/components/game/GameSummary";
import { ConfettiBurst } from "@/components/game/ConfettiBurst";
import { calcAnswerXp, difficultyColor } from "@/lib/gameEngine";
import type { GameMasterItem, GameFinishResult } from "@/lib/types";

interface Question {
  item: GameMasterItem;
  options: string[];
  answer: string;
}

const BASE_FALL_TIME = 6;
const MIN_FALL_TIME = 2.4;
const FALL_STEP = 0.35;
const DANGER_LINE_PCT = 82;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(items: GameMasterItem[]): Question[] {
  const pool = items.filter((i) => i.translation);
  const qs: Question[] = [];
  for (const item of pool) {
    const distractors = shuffle(pool.filter((i) => i.id !== item.id))
      .slice(0, 3)
      .map((i) => i.translation!) as string[];
    if (distractors.length < 3) continue;
    qs.push({ item, answer: item.translation!, options: shuffle([item.translation!, ...distractors]) });
  }
  return shuffle(qs).slice(0, 16);
}

export default function WordDropPage() {
  const [phase, setPhase] = useState<"loading" | "playing" | "finishing" | "summary" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameKey, setGameKey] = useState(0);

  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [fallTime, setFallTime] = useState(BASE_FALL_TIME);
  const [timeLeft, setTimeLeft] = useState(BASE_FALL_TIME);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const [result, setResult] = useState<GameFinishResult | null>(null);
  const [burst, setBurst] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setPhase("loading");
    setIndex(0);
    setLives(3);
    setCombo(0);
    setBestCombo(0);
    setXp(0);
    setCorrect(0);
    apiGet<{ items: GameMasterItem[] }>("/api/game/pool?items=45")
      .then((res) => {
        const qs = buildQuestions(res.items);
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
    const ft = Math.max(MIN_FALL_TIME, BASE_FALL_TIME - combo * FALL_STEP);
    setFallTime(ft);
    setTimeLeft(ft);
    setLocked(false);
    setChosen(null);
    setMissed(false);
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
        learnedWords: questions.map((qq) => qq.item),
      });
      setResult(res);
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
      <GameSummary
        correct={correct}
        total={questions.length}
        xpGained={xp}
        result={result}
        accent="from-accent-green to-accent"
        onReplay={() => {
          setResult(null);
          setGameKey((k) => k + 1);
        }}
      />
    );
  }

  const fallPct = Math.max(0, Math.min(DANGER_LINE_PCT, (1 - timeLeft / fallTime) * DANGER_LINE_PCT));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Rocket className="h-5 w-5 text-accent-green" /> Word Drop
        </h1>
        <Link href="/game">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Exit
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart key={i} className={`h-5 w-5 ${i < lives ? "fill-accent-red text-accent-red" : "text-border"}`} />
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold">
          {combo > 1 && (
            <span className="flex items-center gap-1 text-accent-yellow">
              <Flame className="h-4 w-4" /> x{combo}
            </span>
          )}
          <span className="text-accent-green">{xp} XP</span>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div className="h-full rounded-full bg-accent-green transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative h-64 overflow-hidden rounded-[var(--radius-lg)] border border-accent-green/30 bg-gradient-to-b from-bg-secondary to-accent-green/5 shadow-lg"
      >
        <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-1/2" />
        {/* Danger line */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-accent-red/50"
          style={{ top: `${DANGER_LINE_PCT}%` }}
        />
        <span className="absolute right-2 text-[10px] font-semibold uppercase tracking-wide text-accent-red/70" style={{ top: `${DANGER_LINE_PCT}%` }}>
          catch zone
        </span>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.85, rotate: -4 }}
            animate={{
              opacity: 1,
              scale: missed ? [1, 1.1, 0.9] : 1,
              y: missed ? [0, -4, 0] : 0,
              rotate: [-3, 3, -3],
            }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2, rotate: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }}
            className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ top: `${fallPct}%` }}
          >
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${difficultyColor(q.item.difficulty)}`}
            >
              {q.item.difficulty}
            </span>
            <span
              className={`rounded-xl border px-4 py-2 text-lg font-extrabold shadow-lg ${
                locked
                  ? chosen === q.answer
                    ? "border-accent-green bg-accent-green/20 text-accent-green shadow-accent-green/30"
                    : "border-accent-red bg-accent-red/20 text-accent-red shadow-accent-red/30"
                  : "border-accent-green/40 bg-bg-primary text-content-primary shadow-accent-green/10"
              }`}
            >
              {q.item.word}
            </span>
            {locked && (
              <span className="mt-1 flex items-center gap-1 text-xs font-semibold">
                {chosen === q.answer ? (
                  <>
                    <Check className="h-3 w-3 text-accent-green" /> <span className="text-accent-green">+{Math.round(calcAnswerXp(combo, 0.5))} XP</span>
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const isAnswer = opt === q.answer;
          const isChosen = opt === chosen;
          const show = locked && (isAnswer || isChosen);
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.96 }}
              disabled={locked}
              onClick={() => handleAnswer(opt)}
              className={`rounded-[var(--radius)] border px-4 py-3 text-left text-sm font-medium transition-colors ${
                show && isAnswer
                  ? "border-accent-green bg-accent-green/15 text-accent-green"
                  : show && isChosen
                  ? "border-accent-red bg-accent-red/15 text-accent-red"
                  : "border-border bg-bg-primary hover:border-accent-green/50 hover:bg-accent-green/5"
              }`}
            >
              <span className="flex items-center justify-between">
                {opt}
                {show && isAnswer && <Check className="h-4 w-4" />}
                {show && isChosen && !isAnswer && <X className="h-4 w-4" />}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
