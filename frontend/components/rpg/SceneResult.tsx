"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Flame,
  Map as MapIcon,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { FinishResponse } from "@/lib/rpg/types";

/**
 * The end-of-scene screen: what the player scored, what they learned, and —
 * most importantly — the corrections, which are only ever shown HERE and never
 * during the roleplay.
 */
export function SceneResult({ result }: { result: FinishResponse }) {
  const scoreColor =
    result.scene_score >= 80
      ? "text-accent-green"
      : result.scene_score >= 50
      ? "text-accent-yellow"
      : "text-accent-red";

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
            Sahna natijasi
          </p>
          <p className={cn("mt-1 text-5xl font-extrabold tabular-nums", scoreColor)}>
            {result.scene_score}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm">
            <span className="flex items-center gap-1 font-semibold text-accent">
              <Sparkles className="h-4 w-4" /> +{result.xp_gained} XP
            </span>
            <span className="flex items-center gap-1 text-content-secondary">
              <Flame className="h-4 w-4 text-accent-red" /> {result.streak} kun
            </span>
            <span className="text-content-secondary">Jami: {result.total_xp} XP</span>
          </div>
        </Card>
      </motion.div>

      {result.level_message_uz && (
        <Card
          className={cn(
            "flex items-center gap-3",
            result.level_changed === 1
              ? "border-accent-green/40 bg-accent-green/10"
              : "border-accent-yellow/40 bg-accent-yellow/10"
          )}
        >
          {result.level_changed === 1 ? (
            <TrendingUp className="h-5 w-5 shrink-0 text-accent-green" />
          ) : (
            <TrendingDown className="h-5 w-5 shrink-0 text-accent-yellow" />
          )}
          <p className="text-sm">{result.level_message_uz}</p>
        </Card>
      )}

      {result.new_badges.length > 0 && (
        <Card className="border-accent-purple/40 bg-accent-purple/10">
          <div className="flex flex-wrap items-center gap-2">
            <Award className="h-5 w-5 text-accent-purple" />
            {result.new_badges.map((b) => (
              <span
                key={b}
                className="rounded-full bg-accent-purple/20 px-3 py-1 text-xs font-semibold text-accent-purple"
              >
                {b}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle className="mb-3">Vazifalar</CardTitle>
        <ul className="space-y-2">
          {result.objectives.map((o) => (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              {o.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" />
              )}
              <span className={o.done ? "" : "text-content-secondary"}>
                {o.title_uz}
                {!o.required && (
                  <span className="ml-1 text-[10px] text-accent-yellow/80">qo&apos;shimcha</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {result.new_words.length > 0 && (
        <Card>
          <CardTitle className="mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" /> Yangi so&apos;zlar
          </CardTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {result.new_words.map((w) => (
              <div key={w.word} className="rounded-[var(--radius)] bg-bg-tertiary p-3">
                <p className="font-semibold">{w.word}</p>
                <p className="text-xs text-content-secondary">{w.uz}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-secondary">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${w.strength}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-purple"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result.errors.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Xatolar tahlili</CardTitle>
          <div className="space-y-3">
            {result.errors.map((e, i) => (
              <div key={i} className="rounded-[var(--radius)] bg-bg-tertiary p-3 text-sm">
                <p className="text-accent-red line-through decoration-accent-red/50">{e.original}</p>
                <p className="mt-1 font-medium text-accent-green">{e.corrected}</p>
                {e.note_uz && (
                  <p className="mt-1.5 text-xs text-content-secondary">{e.note_uz}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/games/new-city" className="flex-1">
          <Button variant="outline" className="w-full">
            <MapIcon className="h-4 w-4" /> Xaritaga qaytish
          </Button>
        </Link>
        {result.next_scene_id && (
          <Link href={`/games/new-city/${result.next_scene_id}`} className="flex-1">
            <Button variant="gradient" className="w-full">
              Keyingi sahna <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
