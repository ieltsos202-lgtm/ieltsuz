"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, Check } from "lucide-react";

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
  CelebrationOverlay,
} from "@/components/game/juice";
import { calcAnswerXp, difficultyColor } from "@/lib/gameEngine";
import { memoryMatchDifficulty, crossedTier, tierForLevel } from "@/lib/leveling";
import type { GameMasterItem, GameFinishResult, GameStats } from "@/lib/types";

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

function buildRounds(items: GameMasterItem[], pairsPerBoard: number, boards: number): GameMasterItem[][] {
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
  for (let i = 0; i + pairsPerBoard <= pool.length && rounds.length < boards; i += pairsPerBoard) {
    rounds.push(pool.slice(i, i + pairsPerBoard));
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

export default function MemoryMatchPage() {
  const [phase, setPhase] = useState<"loading" | "playing" | "finishing" | "summary" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<GameMasterItem[][]>([]);
  const [gameKey, setGameKey] = useState(0);

  const [level, setLevel] = useState(1);
  const [roundIndex, setRoundIndex] = useState(0);
  const [cards, setCards] = useState<CardT[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [totalMatched, setTotalMatched] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [previewLeft, setPreviewLeft] = useState(0);
  const [flashText, setFlashText] = useState<string | null>(null);
  const [result, setResult] = useState<GameFinishResult | null>(null);
  const [burst, setBurst] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [boardCleared, setBoardCleared] = useState(false);
  const [celebrate, setCelebrate] = useState<null | { title: string; tier?: string }>(null);
  const timerRef = useRef<number | null>(null);
  const previewRef = useRef<number | null>(null);

  const diff = memoryMatchDifficulty(level);
  const totalPairs = rounds.reduce((sum, r) => sum + r.length, 0);

  useEffect(() => {
    setPhase("loading");
    setRoundIndex(0);
    setLives(3);
    setCombo(0);
    setBestCombo(0);
    setXp(0);
    setTotalMatched(0);
    Promise.all([
      apiGet<{ items: GameMasterItem[] }>("/api/game/pool?items=60"),
      apiGet<GameStats>("/api/game/stats").catch(() => null),
    ])
      .then(([res, stats]) => {
        const lvl = stats?.level ?? 1;
        setLevel(lvl);
        const d = memoryMatchDifficulty(lvl);
        const built = buildRounds(res.items, d.pairsPerBoard, d.boards);
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

  // Round setup: build cards, optional face-up preview, then the board timer.
  useEffect(() => {
    if (phase !== "playing" || rounds.length === 0) return;
    const items = rounds[roundIndex];
    if (!items) return;
    setCards(buildCards(items));
    setFlipped([]);
    setBusy(false);
    setFlashText(null);
    setBoardCleared(false);

    const rt = Math.max(20, diff.roundSeconds - roundIndex * 4);
    setTimeLeft(rt);

    // Preview: all cards face-up for a moment, then they flip down.
    if (diff.previewSeconds > 0) {
      setPreviewLeft(diff.previewSeconds);
      setBusy(true);
      previewRef.current = window.setInterval(() => {
        setPreviewLeft((s) => {
          if (s <= 1) {
            if (previewRef.current) window.clearInterval(previewRef.current);
            previewRef.current = null;
            setBusy(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      setPreviewLeft(0);
    }

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
      if (previewRef.current) window.clearInterval(previewRef.current);
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
    setShakeKey((k) => k + 1);
    setLives((l) => {
      const next = l - 1;
      window.setTimeout(() => (next <= 0 ? finish() : advanceRound()), 1200);
      return next;
    });
  }

  async function finish() {
    setPhase("finishing");
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (previewRef.current) window.clearInterval(previewRef.current);
    try {
      const res = await apiPost<GameFinishResult>("/api/game/finish", {
        xpGained: xp,
        bestCombo,
        score: totalMatched,
        game: "memory-match",
        learnedWords: rounds.flat(),
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

  function handleFlip(card: CardT) {
    if (busy || previewLeft > 0 || card.matched || flipped.includes(card.id) || flipped.length >= 2) return;
    const nextFlipped = [...flipped, card.id];
    setFlipped(nextFlipped);
    if (nextFlipped.length < 2) return;

    setBusy(true);
    const [id1, id2] = nextFlipped;
    const c1 = cards.find((c) => c.id === id1);
    const c2 = cards.find((c) => c.id === id2);
    const isMatch = !!c1 && !!c2 && c1.pairId === c2.pairId;
    const rt = Math.max(20, diff.roundSeconds - roundIndex * 4);

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

  // Board cleared → celebration, then next board.
  useEffect(() => {
    if (phase !== "playing" || cards.length === 0) return;
    if (cards.every((c) => c.matched)) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setBoardCleared(true);
      window.setTimeout(() => {
        setBoardCleared(false);
        advanceRound();
      }, 1600);
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
      <>
        <CelebrationOverlay
          show={!!celebrate}
          title={celebrate?.title || ""}
          tierName={celebrate?.tier}
          subtitle={celebrate?.tier ? "Bigger boards, less time — welcome up." : undefined}
          onDone={() => setCelebrate(null)}
          durationMs={celebrate?.tier ? 3000 : 2000}
        />
        <GameSummary
          correct={totalMatched}
          total={totalPairs}
          xpGained={xp}
          result={result}
          accent="from-accent-purple to-accent"
          onReplay={() => {
            setResult(null);
            setCelebrate(null);
            setGameKey((k) => k + 1);
          }}
        />
      </>
    );
  }

  const rt = Math.max(20, diff.roundSeconds - roundIndex * 4);
  const comboIntensity = Math.min(1, combo / 8);
  // Wider boards need more columns; keep cells tappable on mobile.
  const cols = diff.pairsPerBoard <= 6 ? "grid-cols-3 sm:grid-cols-4" : diff.pairsPerBoard <= 8 ? "grid-cols-4 sm:grid-cols-4" : "grid-cols-4 sm:grid-cols-5";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <GameBackground palette="purple" intensity={comboIntensity} />

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LayoutGrid className="h-5 w-5 text-accent-purple" /> Memory Match
          <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] font-bold text-accent-purple">
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
          <XPCounter xp={xp} className="text-accent-purple" />
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent transition-all"
          style={{ width: `${((roundIndex + totalMatched / Math.max(1, totalPairs)) / rounds.length) * 100}%` }}
        />
      </div>
      <TimerBar ratio={timeLeft / rt} />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative space-y-3 rounded-[var(--radius-lg)] border border-accent-purple/30 bg-gradient-to-br from-accent-purple/15 via-bg-secondary/90 to-accent/10 p-5 shadow-xl shadow-accent-purple/10 backdrop-blur-sm"
      >
        <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-1/3" />
        <ComboBurst combo={combo} />
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-accent-purple">
          Board {roundIndex + 1}/{rounds.length} — tap two cards to match a word with its meaning
        </p>

        {previewLeft > 0 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm font-bold text-accent-yellow">
            Memorise! {previewLeft}s
          </motion.p>
        )}
        {flashText && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-center text-sm font-semibold text-accent-green">
            {flashText}
          </motion.p>
        )}

        <div className={`grid ${cols} gap-2.5`}>
          {cards.map((card, ci) => {
            const isFlipped = previewLeft > 0 || flipped.includes(card.id) || card.matched;
            return (
              <motion.button
                key={card.id}
                onClick={() => handleFlip(card)}
                disabled={busy || previewLeft > 0 || card.matched || flipped.includes(card.id)}
                className="relative aspect-square [perspective:800px]"
                // Ambient "breathing" so the board never feels static.
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2.6 + (ci % 5) * 0.3, repeat: Infinity, ease: "easeInOut", delay: (ci % 7) * 0.18 }}
                whileTap={{ scale: 0.93 }}
              >
                <motion.div
                  className="relative h-full w-full"
                  style={{ transformStyle: "preserve-3d" }}
                  animate={{
                    rotateY: isFlipped ? 180 : 0,
                    scale: card.matched ? [1, 1.14, 1] : 1,
                  }}
                  transition={{ duration: 0.4, scale: { duration: 0.5 } }}
                >
                  {/* Card back — patterned gradient */}
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-lg border border-accent-purple/40 bg-gradient-to-br from-accent-purple/25 via-bg-tertiary to-accent/20 shadow-md"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <span className="text-lg font-extrabold text-accent-purple/60">?</span>
                  </div>
                  {/* Card front — colour-coded by kind, gold-locked when matched */}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center text-[11px] font-semibold leading-tight ${
                      card.matched
                        ? "border-accent-yellow/70 bg-accent-yellow/15 text-accent-yellow shadow-lg shadow-accent-yellow/25"
                        : card.kind === "word"
                        ? "border-accent bg-accent/15 text-content-primary"
                        : "border-accent-purple bg-accent-purple/15 text-content-primary"
                    }`}
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    {card.matched && <Check className="h-3.5 w-3.5" />}
                    <span className={`rounded px-1 text-[8px] font-bold uppercase tracking-wide ${difficultyColor(card.difficulty)}`}>
                      {card.difficulty}
                    </span>
                    {card.text}
                  </div>
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Board-complete celebration */}
      <CelebrationOverlay
        show={boardCleared}
        title={`Board ${roundIndex + 1} cleared!`}
        subtitle={roundIndex + 1 < rounds.length ? "Next board coming up…" : "Final results…"}
        durationMs={1500}
      />
    </div>
  );
}
