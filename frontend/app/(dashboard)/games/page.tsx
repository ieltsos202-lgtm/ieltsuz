"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Gamepad2, Lock } from "lucide-react";

import { GAMES } from "@/lib/games";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * The games hub. Cards come from lib/games.ts — adding a new game is one entry
 * there, nothing else.
 */
export default function GamesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
          <Gamepad2 className="h-6 w-6 text-accent" /> Games
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          O&apos;yin orqali ingliz tilini o&apos;rganing — har bir o&apos;yin alohida ko&apos;nikmani
          mashq qiladi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((game, i) => {
          const Icon = game.icon;
          const card = (
            <Card
              className={cn(
                "flex h-full flex-col gap-3 transition-colors",
                game.coming_soon ? "opacity-60" : "hover:border-accent"
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-[var(--radius)] bg-gradient-to-br text-white",
                  game.gradient
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold">{game.title}</h2>
                  {game.coming_soon && (
                    <span className="flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-semibold text-content-secondary">
                      <Lock className="h-3 w-3" /> Tez kunda
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-content-secondary">{game.description_uz}</p>
              </div>
              {!game.coming_soon && (
                <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                  O&apos;ynash <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Card>
          );

          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              {game.coming_soon ? card : <Link href={game.href}>{card}</Link>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
