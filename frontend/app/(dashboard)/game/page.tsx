"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, LayoutGrid, Rocket, Sparkles, Trophy, Flame } from "lucide-react";

import { apiGet } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { tierForLevel } from "@/lib/leveling";
import type { GameStats } from "@/lib/types";

interface GameCardDef {
  href: string;
  id: string;
  title: string;
  tagline: string;
  icon: any;
  gradient: string;
  glow: string;
}

const GAMES: GameCardDef[] = [
  {
    href: "/game/speed-match",
    id: "speed-match",
    title: "Speed Match",
    tagline: "Race the clock to match words & idioms with their meaning. Build combos, beat the timer.",
    icon: Zap,
    gradient: "from-accent-yellow to-accent-red",
    glow: "shadow-accent-yellow/20",
  },
  {
    href: "/game/word-guess",
    id: "memory-match",
    title: "Memory Match",
    tagline: "Flip cards and pair up words with their meanings before the board timer runs out.",
    icon: LayoutGrid,
    gradient: "from-accent-purple to-accent",
    glow: "shadow-accent-purple/20",
  },
  {
    href: "/game/sentence-builder",
    id: "word-drop",
    title: "Word Drop",
    tagline: "Catch falling words with the right meaning before they hit the ground — speed ramps up fast!",
    icon: Rocket,
    gradient: "from-accent-green to-accent",
    glow: "shadow-accent-green/20",
  },
];

export default function GameHubPage() {
  const [stats, setStats] = useState<GameStats | null>(null);

  useEffect(() => {
    apiGet<GameStats>("/api/game/stats").then(setStats).catch(() => {});
  }, []);

  const tier = stats ? tierForLevel(stats.level) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-extrabold">
          <Sparkles className="h-7 w-7 text-accent" /> Games
        </h1>
        <p className="mt-2 text-content-secondary">
          Level up your vocabulary and grammar with 3 addictive mini-games — built straight from real IELTS test content.
        </p>
      </div>

      {stats && tier && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="flex flex-col items-center gap-3 bg-gradient-to-r from-accent/10 via-transparent to-accent-purple/10 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${tier.gradient} text-lg font-bold text-white shadow-lg`}
              >
                {stats.level}
              </motion.div>
              <div>
                <p className="text-sm font-semibold">
                  Level {stats.level}
                  <span className={`ml-2 rounded-full bg-gradient-to-r ${tier.gradient} bg-clip-text text-xs font-extrabold text-transparent`}>
                    {tier.name} · {tier.cefr}
                  </span>
                </p>
                <p className="text-xs text-content-secondary">
                  {stats.games_played} games played · best streak x{stats.best_combo}
                </p>
              </div>
            </div>
            <div className="w-full max-w-xs sm:w-56">
              <div className="flex items-center justify-between text-xs text-content-secondary">
                <span>{stats.xp_into_level} XP</span>
                <span>{stats.xp_needed} XP</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.percent}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  className={`h-full rounded-full bg-gradient-to-r ${tier.gradient}`}
                />
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        {GAMES.map((g, i) => {
          const Icon = g.icon;
          const gs = stats?.game_stats?.[g.id];
          return (
            <motion.div
              key={g.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Link href={g.href}>
                <div
                  className={`group relative h-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-6 shadow-lg transition-transform hover:-translate-y-1 ${g.glow}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${g.gradient} opacity-10 transition-opacity group-hover:opacity-20`} />
                  <div className={`relative mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${g.gradient} text-white shadow-lg`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="relative text-lg font-bold">{g.title}</h3>
                  <p className="relative mt-2 text-sm text-content-secondary">{g.tagline}</p>
                  {gs && (gs.plays ?? 0) > 0 && (
                    <div className="relative mt-3 flex items-center gap-3 text-[11px] font-semibold text-content-secondary">
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3 text-accent-yellow" /> {gs.best_score ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className="h-3 w-3 text-accent-red" /> x{gs.best_streak ?? 0}
                      </span>
                      <span>{gs.plays} plays</span>
                    </div>
                  )}
                  <div className="relative mt-4 flex items-center gap-1 text-sm font-semibold text-accent">
                    Play now <span aria-hidden>→</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
