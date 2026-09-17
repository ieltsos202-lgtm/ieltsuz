"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Zap, Check, X } from "lucide-react";

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
  TimerBar,
  LevelBadge,
  OptionButton,
  CelebrationOverlay,
} from "@/components/game/juice";
import { calcAnswerXp } from "@/lib/gameEngine";
import { speedMatchDifficulty, crossedTier, tierForLevel } from "@/lib/leveling";
import type { GameMasterItem, GameFinishResult, GameStats } from "@/lib/types";

interface Question {
  item: GameMasterItem;
  options: string[];
  answer: string;
}

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
    // Tricky mode: prefer distractors from the same CEFR tier so wrong
    // options look plausible instead of random.
    const sameTier = pool.filter((i) => i.id !== item.id && i.difficulty === item.difficulty);
    const others = pool.filter((i) => i.id !== item.id && i.difficulty !== item.difficulty);
    const distractorPool = tricky && sameTier.length >= 3 ? sameTier : [...sameTier, ...others];
    const distractors = shuffle(distractorPool).slice(0, 3).map((i) => i.translation!) as string[];
    if (distractors.length < 3) continue;
    qs.push({ item, answer: item.translation!, options: shuffle([item.translation!, ...distractors]) });
  }
  return shuffle(qs).slice(0, count);
}

export default function SpeedMatchPage() {
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
  const [timeLeft, setTimeLeft] = useState(8);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<GameFinishResult | null>(null);
  const [burst, setBurst] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [celebrate, setCelebrate] = useState<null | { title: string; tier?: string }>(null);
  const timerRef = useRef<number | null>(null);

  const diff = speedMatchDifficulty(level);
  const timeLimit = diff.timerSeconds;

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
        const d = speedMatchDifficulty(lvl);
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
    setTimeLeft(timeLimit);
    setLocked(false);
    setChosen(null);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 0.1) {
          window.clearInterval(timerRef.current!);
          handleAnswer(null);
          return 0;
        }
        return t - 0.1;
      });
    }, 100);
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
        game: "speed-match",
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
      const gained = calcAnswerXp(combo, timeLeft / timeLimit);
      setXp((x) => x + gained);
      setCombo((c) => {
        const next = c + 1;
        setBestCombo((b) => Math.max(b, next));
        return next;
      });
      setCorrect((c) => c + 1);
      setBurst(Date.now());
    } else {
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
    }, 900);
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
          subtitle={celebrate?.tier ? "Harder words, faster rounds — you're moving up." : undefined}
          onDone={() => setCelebrate(null)}
          durationMs={celebrate?.tier ? 3000 : 2000}
        />
        <GameSummary
          correct={correct}
          total={questions.length}
          xpGained={xp}
          result={result}
          accent="from-accent-yellow to-accent-red"
          onReplay={() => {
            setResult(null);
            setCelebrate(null);
            setGameKey((k) => k + 1);
          }}
        />
      </>
    );
  }

  const comboIntensity = Math.min(1, combo / 8);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <GameBackground palette="orange" intensity={comboIntensity} />

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Zap className="h-5 w-5 text-accent-yellow" /> Speed Match
          <span className="rounded-full bg-accent-yellow/15 px-2 py-0.5 text-[10px] font-bold text-accent-yellow">
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
            <motion.span
              key={combo}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1 text-accent-yellow"
            >
              <Zap className="h-4 w-4 fill-accent-yellow" /> x{combo}
            </motion.span>
          )}
          <XPCounter xp={xp} className="text-accent-yellow" />
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-yellow to-accent-red transition-all"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <TimerBar ratio={timeLeft / timeLimit} />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative"
      >
        <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-1/4" />
        <ComboBurst combo={combo} />
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 40, rotate: -3, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, rotate: 3, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="space-y-5 rounded-[var(--radius-lg)] border border-accent-yellow/30 bg-gradient-to-br from-accent-yellow/15 via-bg-secondary/90 to-accent-red/15 p-8 text-center shadow-xl shadow-accent-yellow/10 backdrop-blur-sm"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="inline-block rounded-full bg-accent-yellow/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-yellow">
                {q.item.type === "idiom" ? "Idiom" : "Word"}
              </span>
              <LevelBadge label={q.item.difficulty} />
            </div>
            <motion.h2
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 14 }}
              className="text-3xl font-extrabold"
            >
              {q.item.word}
            </motion.h2>
            {q.item.phonetic && <p className="text-sm text-content-secondary">{q.item.phonetic}</p>}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {q.options.map((opt, i) => {
                const isAnswer = opt === q.answer;
                const isChosen = opt === chosen;
                const state = !locked ? "idle" : isAnswer ? "correct" : isChosen ? "wrong" : "idle";
                return (
                  <OptionButton
                    key={i}
                    index={i}
                    text={opt}
                    state={state}
                    disabled={locked}
                    onClick={() => handleAnswer(opt)}
                  />
                );
              })}
            </div>
            {locked && chosen && chosen !== q.answer && (
              <p className="flex items-center justify-center gap-1 text-xs font-semibold text-accent-red">
                <X className="h-3.5 w-3.5" /> Correct: {q.answer}
              </p>
            )}
            {locked && chosen === q.answer && (
              <p className="flex items-center justify-center gap-1 text-xs font-semibold text-accent-green">
                <Check className="h-3.5 w-3.5" /> Nice!
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
