"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Crown,
  Flame,
  Lock,
  MapPin,
  Play,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { RpgProfileView, SceneListItem } from "@/lib/rpg/types";

/** The player's local calendar date — the daily allowance resets at THEIR midnight. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RpgMapPage() {
  const [scenes, setScenes] = useState<SceneListItem[] | null>(null);
  const [profile, setProfile] = useState<RpgProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, p] = await Promise.all([
          apiGet<{ scenes: SceneListItem[] }>("/api/rpg/scenes"),
          apiGet<RpgProfileView>(`/api/rpg/profile?day=${today()}`),
        ]);
        setScenes(s.scenes);
        setProfile(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Yuklab bo'lmadi");
      }
    })();
  }, []);

  if (error) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-sm text-content-secondary">{error}</p>
      </Card>
    );
  }

  if (!scenes || !profile) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header: story title + streak/XP */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
          <MapPin className="h-6 w-6 text-accent" /> New City
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          1-bob: Siz Londonga yangi kelgansiz. Har bir sahnada haqiqiy odamlar bilan inglizcha
          gaplashib, kundalik vaziyatlarni yeching.
        </p>
      </div>

      <Card className="flex flex-col gap-4 bg-gradient-to-r from-accent/10 via-transparent to-accent-purple/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-purple text-lg font-bold text-white">
            {profile.level}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {profile.level}-daraja
              <span className="ml-2 text-xs font-normal text-content-secondary">
                {profile.level === 1
                  ? "javobni tanlash"
                  : profile.level === 2
                  ? "gap tuzish"
                  : "erkin yozish"}
              </span>
            </p>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-content-secondary">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent" /> {profile.xp} XP
              </span>
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-accent-red" /> {profile.streak} kun
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> {profile.words_learned} so&apos;z
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!profile.is_pro && (
            <div className="text-right text-xs text-content-secondary">
              <p>
                Bugun: <span className="font-semibold text-content-primary">{profile.limits.scenes_left}</span>{" "}
                sahna qoldi
              </p>
              <p>{profile.limits.turns_left} suhbat navbati</p>
            </div>
          )}
          <Link href="/games/new-city/words">
            <Button variant="outline" size="sm">
              <BookOpen className="h-4 w-4" /> So&apos;zlarim
            </Button>
          </Link>
        </div>
      </Card>

      {!profile.is_pro && profile.limits.scenes_left === 0 && (
        <Card className="flex flex-col items-center gap-3 border-accent-yellow/40 bg-accent-yellow/10 text-center sm:flex-row sm:text-left">
          <Crown className="h-6 w-6 shrink-0 text-accent-yellow" />
          <p className="flex-1 text-sm">
            Bugungi bepul sahnalar tugadi. Pro bilan cheksiz o&apos;ynang va ertagagacha kutmang.
          </p>
          <Link href="/upgrade">
            <Button variant="gradient" size="sm">
              Pro olish
            </Button>
          </Link>
        </Card>
      )}

      {/* The chapter path */}
      <div className="relative space-y-3">
        {/* Vertical line connecting the scene nodes. */}
        <div className="absolute left-[22px] top-4 bottom-4 w-px bg-border" aria-hidden />

        {scenes.map((scene, i) => (
          <motion.div
            key={scene.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="relative flex gap-4"
          >
            {/* Node */}
            <div
              className={cn(
                "z-10 mt-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                scene.completed
                  ? "border-accent-green bg-accent-green/20 text-accent-green"
                  : scene.locked
                  ? "border-border bg-bg-secondary text-content-secondary"
                  : "border-accent bg-accent/20 text-accent"
              )}
            >
              {scene.locked ? <Lock className="h-4 w-4" /> : scene.order}
            </div>

            <SceneRow scene={scene} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SceneRow({ scene }: { scene: SceneListItem }) {
  const body = (
    <Card
      className={cn(
        "flex-1 transition-colors",
        scene.locked ? "opacity-60" : "hover:border-accent",
        scene.recommended && !scene.locked && "border-accent/50 bg-accent/5"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{scene.title_uz}</h3>
            {scene.recommended && !scene.locked && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                Tavsiya etiladi
              </span>
            )}
            {scene.completed && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-accent-green">
                <Trophy className="h-3 w-3" /> {scene.best_score}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-content-secondary">
            {scene.npc_name} — {scene.npc_role_uz}
          </p>
          <p className="mt-2 text-sm text-content-secondary">{scene.intro_uz}</p>

          {scene.due_words > 0 && (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-accent-yellow">
              <Star className="h-3 w-3" /> {scene.due_words} so&apos;z takrorlashga tayyor
            </p>
          )}
        </div>

        {!scene.locked && (
          <Button variant={scene.completed ? "outline" : "gradient"} size="sm">
            <Play className="h-4 w-4" />
            {scene.completed ? "Qayta" : "Boshlash"}
          </Button>
        )}
      </div>

      {scene.locked && (
        <p className="mt-2 text-[11px] text-content-secondary">
          Avvalgi sahnani tugatgandan keyin ochiladi.
        </p>
      )}
    </Card>
  );

  return scene.locked ? body : <Link href={`/games/new-city/${scene.id}`} className="flex flex-1">{body}</Link>;
}
