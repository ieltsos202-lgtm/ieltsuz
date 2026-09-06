"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, Heart, Flame, HelpCircle } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { GameSummary } from "@/components/game/GameSummary";
import { ConfettiBurst } from "@/components/game/ConfettiBurst";
import { calcAnswerXp, difficultyColor } from "@/lib/gameEngine";
import type { GameMasterItem, GameFinishResult } from "@/lib/types";

const PAIRS_PER_ROUND = 5;
const MAX_ROUNDS = 3;
const BASE_ROUND_TIME = 45;

interface CardT {
  id: string;
  pairId: string;
  text: string;
  kind: "word" | "translation";
  matched: boolean;
  difficulty: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRounds(items: GameMasterItem[]): GameMasterItem[][] {
  const seenWord = new Set<string>();
  const seenTranslation = new Set<string>();
  const usable = items.filter((i) => {
    if (!i.translation) return false;
    const w = i.word.trim().toLowerCase();
    const t = i.translation.trim().toLowerCase();
    if (seenWord.has(w) || seenTranslation.has(t)) return false;
    seenWord.add(w);
    seenTranslation.add(t);
    return true;
  });
  const pool = shuffle(usable);
  const rounds: GameMasterItem[][] = [];
  for (let i = 0; i + PAIRS_PER_ROUND <= pool.length && rounds.length < MAX_ROUNDS; i += PAIRS_PER_ROUND) {
    rounds.push(pool.slice(i, i + PAIRS_PER_ROUND));
  }
  if (rounds.length === 0 && pool.length >= 3) {
    rounds.push(pool.slice(0, pool.length));
  }
  return rounds;
}

function buildCards(items: GameMasterItem[]): CardT[] {
  const cards: CardT[] = [];
  items.forEach((it) => {
    cards.push({ id: `${it.id}-w`, pairId: it.id, text: it.word, kind: "word", matched: false, difficulty: it.difficulty });
    cards.push({ id: `${it.id}-t`, pairId: it.id, text: it.translation!, kind: "translation", matched: false, difficulty: it.difficulty });
  });
  return shuffle(cards);
}

function roundTimeFor(roundIndex: number) {
  return Math.max(25, BASE_ROUND_TIME - roundIndex * 8);
}

export default function MemoryMatchPage() {
  const [phase, setPhase] = useState<"loading" | "playing" | "finishing" | "summary" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<GameMasterItem[][]>([]);
  const [gameKey, setGameKey] = useState(0);

  const [roundIndex, setRoundIndex] = useState(0);
  const [cards, setCards] = useState<CardT[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [totalMatched, setTotalMatched] = useState(0);
  const [timeLeft, setTimeLeft] = useState(BASE_ROUND_TIME);
  const [flashText, setFlashText] = useState<string | null>(null);
  const [result, setResult] = useState<GameFinishResult | null>(null);
  const [burst, setBurst] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const timerRef = useRef<number | null>(null);

  const totalPairs = rounds.reduce((sum, r) => sum + r.length, 0);

  useEffect(() => {
    setPhase("loading");
    setRoundIndex(0);
    setLives(3);
    setCombo(0);
    setBestCombo(0);
    setXp(0);
    setTotalMatched(0);
    apiGet<{ items: GameMasterItem[] }>("/api/game/pool?items=45")
      .then((res) => {
        const built = buildRounds(res.items);
        if (built.length === 0) throw new Error("Not enough vocabulary in the pool yet.");
        setRounds(built);
        setPhase("playing");
      })
      .catch((e) => {
        setError(e.message || "Could not load the game.");
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  useEffect(() => {
    if (phase !== "playing" || rounds.length === 0) return;
    const items = rounds[roundIndex];
    if (!items) return;
    setCards(buildCards(items));
    setFlipped([]);
    setBusy(false);
    setFlashText(null);
    const rt = roundTimeFor(roundIndex);
    setTimeLeft(rt);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 0.1) {
          window.clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return t - 0.1;
      });
    }, 100);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIndex, phase, rounds.length]);

  function advanceRound() {
    if (roundIndex + 1 >= rounds.length) {
      finish();
    } else {
      setRoundIndex((i) => i + 1);
    }
  }

  function handleTimeout() {
    setCombo(0);
    setFlashText("Time's up!");
    setLives((l) => {
      const next = l - 1;
      window.setTimeout(() => (next <= 0 ? finish() : advanceRound()), 1200);
      return next;
    });
  }

  async function finish() {
    setPhase("finishing");
    if (timerRef.current) window.clearInterval(timerRef.current);
    try {
      const res = await apiPost<GameFinishResult>("/api/game/finish", {
        xpGained: xp,
        bestCombo,
        learnedWords: rounds.flat(),
      });
      setResult(res);
    } catch {
      setResult(null);
    }
    setPhase("summary");
  }

  function handleFlip(card: CardT) {
    if (busy || card.matched || flipped.includes(card.id) || flipped.length >= 2) return;
    const nextFlipped = [...flipped, card.id];
    setFlipped(nextFlipped);
    if (nextFlipped.length < 2) return;

    setBusy(true);
    const [id1, id2] = nextFlipped;
    const c1 = cards.find((c) => c.id === id1);
    const c2 = cards.find((c) => c.id === id2);
    const isMatch = !!c1 && !!c2 && c1.pairId === c2.pairId;
    const rt = roundTimeFor(roundIndex);

    if (isMatch) {
      window.setTimeout(() => {
        setCards((cs) => cs.map((c) => (c.id === id1 || c.id === id2 ? { ...c, matched: true } : c)));
        setFlipped([]);
        setBusy(false);
        setBurst(Date.now());
        const gained = calcAnswerXp(combo, timeLeft / rt);
        setXp((x) => x + gained);
        setTotalMatched((m) => m + 1);
        setCombo((c) => {
          const n = c + 1;
          setBestCombo((b) => Math.max(b, n));
          return n;
        });
      }, 450);
    } else {
      window.setTimeout(() => {
        setFlipped([]);
        setBusy(false);
        setCombo(0);
        setShakeKey((k) => k + 1);
      }, 750);
    }
  }

  useEffect(() => {
    if (phase !== "playing" || cards.length === 0) return;
    if (cards.every((c) => c.matched)) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setFlashText("Board cleared!");
      window.setTimeout(() => advanceRound(), 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  if (phase === "loading" || phase === "finishing") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <LoadingSpinner />
        <p className="text-sm text-content-secondary">{phase === "finishing" ? "Saving your progress…" : "Shuffling cards…"}</p>
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
        correct={totalMatched}
        total={totalPairs}
        xpGained={xp}
        result={result}
        accent="from-accent-purple to-accent"
        onReplay={() => {
          setResult(null);
          setGameKey((k) => k + 1);
        }}
      />
    );
  }

  const rt = roundTimeFor(roundIndex);
  const timePct = Math.max(0, Math.min(100, (timeLeft / rt) * 100));

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LayoutGrid className="h-5 w-5 text-accent-purple" /> Memory Match
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
          <span className="text-accent-purple">{xp} XP</span>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-accent-purple transition-all"
          style={{ width: `${((roundIndex + totalMatched / Math.max(1, cards.length / 2)) / rounds.length) * 100}%` }}
        />
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div className={`h-full rounded-full transition-all ${timePct < 30 ? "bg-accent-red" : "bg-accent"}`} style={{ width: `${timePct}%` }} />
      </div>

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative space-y-3 rounded-[var(--radius-lg)] border border-accent-purple/30 bg-gradient-to-br from-accent-purple/10 via-bg-secondary to-accent/10 p-5 shadow-lg"
      >
        <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-1/3" />
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-accent-purple">
          Board {roundIndex + 1}/{rounds.length} — tap two cards to match a word with its meaning
        </p>

        {flashText && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-sm font-semibold text-accent-green"
          >
            {flashText}
          </motion.p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {cards.map((card) => {
            const isFlipped = flipped.includes(card.id) || card.matched;
            return (
              <button
                key={card.id}
                onClick={() => handleFlip(card)}
                disabled={busy || card.matched || flipped.includes(card.id)}
                className="relative aspect-square [perspective:800px]"
              >
                <motion.div
                  className="relative h-full w-full"
                  style={{ transformStyle: "preserve-3d" }}
                  animate={{
                    rotateY: isFlipped ? 180 : 0,
                    scale: card.matched ? [1, 1.12, 1] : 1,
                  }}
                  transition={{ duration: 0.35 }}
                >
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-lg border border-accent-purple/30 bg-bg-tertiary text-xl shadow-sm transition-shadow hover:shadow-md hover:shadow-accent-purple/20"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <HelpCircle className="h-6 w-6 text-accent-purple/50" />
                  </div>
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center text-[11px] font-semibold leading-tight ${
                      card.matched
                        ? "border-accent-green bg-accent-green/15 text-accent-green shadow-lg shadow-accent-green/20"
                        : card.kind === "word"
                        ? "border-accent bg-accent/10 text-content-primary"
                        : "border-accent-purple bg-accent-purple/10 text-content-primary"
                    }`}
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    <span
                      className={`rounded px-1 text-[8px] font-bold uppercase tracking-wide ${difficultyColor(card.difficulty)}`}
                    >
                      {card.difficulty}
                    </span>
                    {card.text}
                  </div>
                </motion.div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
