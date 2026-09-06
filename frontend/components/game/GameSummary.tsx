"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, Star, RotateCcw, LayoutGrid } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfettiBurst } from "@/components/game/ConfettiBurst";
import type { GameFinishResult } from "@/lib/types";

interface Props {
  correct: number;
  total: number;
  xpGained: number;
  result: GameFinishResult | null;
  accent?: string; // tailwind gradient classes, e.g. "from-accent to-accent-purple"
  onReplay: () => void;
}

function starsFor(pct: number): number {
  if (pct >= 90) return 3;
  if (pct >= 60) return 2;
  if (pct >= 30) return 1;
  return 0;
}

export function GameSummary({ correct, total, xpGained, result, accent = "from-accent to-accent-purple", onReplay }: Props) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const stars = starsFor(pct);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setBurst(Date.now()), 350);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200 }}>
        <Card className={`relative overflow-hidden bg-gradient-to-b ${accent}/15 text-center`}>
          {stars > 0 && <ConfettiBurst triggerKey={burst} originClassName="left-1/2 top-10" />}
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Trophy className="mx-auto mb-2 h-12 w-12 text-accent-yellow" />
          </motion.div>
          <h2 className="text-2xl font-bold">Round complete!</h2>

          <div className="mt-2 flex items-center justify-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.35 + i * 0.12, type: "spring", stiffness: 260 }}
              >
                <Star
                  className={`h-7 w-7 ${i < stars ? "fill-accent-yellow text-accent-yellow" : "text-border"}`}
                />
              </motion.div>
            ))}
          </div>

          <p className="mt-1 text-content-secondary">
            {correct}/{total} correct ({pct}%)
          </p>
          <div className={`mt-4 flex items-center justify-center gap-2 bg-gradient-to-r ${accent} bg-clip-text text-3xl font-extrabold text-transparent`}>
            +{xpGained} XP
          </div>

          {result?.leveled_up && (
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-3 flex items-center justify-center gap-2 rounded-full bg-accent-yellow/15 px-4 py-2 text-sm font-semibold text-accent-yellow"
            >
              <Star className="h-4 w-4" /> Level up! You&apos;re now level {result.stats.level}
            </motion.div>
          )}

          {result && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-content-secondary">
                <span>Level {result.stats.level}</span>
                <span>
                  {result.stats.xp_into_level}/{result.stats.xp_needed} XP
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${result.stats.percent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full bg-gradient-to-r ${accent}`}
                />
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/game" className="flex-1">
          <Button variant="outline" className="w-full">
            <LayoutGrid className="h-4 w-4" /> All Games
          </Button>
        </Link>
        <Button variant="gradient" className="flex-1" onClick={onReplay}>
          <RotateCcw className="h-4 w-4" /> Play Again
        </Button>
      </div>
    </div>
  );
}
