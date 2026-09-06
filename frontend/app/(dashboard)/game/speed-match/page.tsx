"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Zap, Check, X } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { GameHud } from "@/components/game/GameHud";
import { GameSummary } from "@/components/game/GameSummary";
import { ConfettiBurst } from "@/components/game/ConfettiBurst";
import { calcAnswerXp, difficultyColor } from "@/lib/gameEngine";
import type { GameMasterItem, GameFinishResult } from "@/lib/types";

interface Question {
  item: GameMasterItem;
  options: string[];
  answer: string;
}

const TIME_LIMIT = 8;

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
  return shuffle(qs).slice(0, 15);
}

export default function SpeedMatchPage() {
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
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
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
    apiGet<{ items: GameMasterItem[] }>("/api/game/pool?items=40")
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
    setTimeLeft(TIME_LIMIT);
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
      const gained = calcAnswerXp(combo, timeLeft / TIME_LIMIT);
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
      <GameSummary
        correct={correct}
        total={questions.length}
        xpGained={xp}
        result={result}
        accent="from-accent-yellow to-accent-red"
        onReplay={() => {
          setResult(null);
          setGameKey((k) => k + 1);
        }}
      />
    );
  }

  const timePct = Math.max(0, Math.min(100, (timeLeft / TIME_LIMIT) * 100));

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Zap className="h-5 w-5 text-accent-yellow" /> Speed Match
        </h1>
        <Link href="/game">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Exit
          </Button>
        </Link>
      </div>

      <GameHud
        lives={lives}
        maxLives={3}
        combo={combo}
        xp={xp}
        progress={((index + 1) / questions.length) * 100}
        accentText="text-accent-yellow"
      />

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={`h-full rounded-full transition-all ${timePct < 30 ? "bg-accent-red" : "bg-accent-green"}`}
          style={{ width: `${timePct}%` }}
        />
      </div>

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative"
      >
        <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-1/4" />
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 30, rotate: -2 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: -30, rotate: 2 }}
            transition={{ duration: 0.25 }}
            className="space-y-5 rounded-[var(--radius-lg)] border border-accent-yellow/30 bg-gradient-to-br from-accent-yellow/10 via-bg-secondary to-accent-red/10 p-8 text-center shadow-lg"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="inline-block rounded-full bg-accent-yellow/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-yellow">
                {q.item.type === "idiom" ? "Idiom" : "Word"}
              </span>
              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${difficultyColor(q.item.difficulty)}`}>
                {q.item.difficulty}
              </span>
            </div>
            <h2 className="text-3xl font-extrabold">{q.item.word}</h2>
            {q.item.phonetic && <p className="text-sm text-content-secondary">{q.item.phonetic}</p>}

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
                      : "border-border bg-bg-primary hover:border-accent-yellow/50 hover:bg-accent-yellow/5"
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
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
