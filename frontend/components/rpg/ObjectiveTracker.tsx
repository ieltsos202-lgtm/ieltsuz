"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Circle, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ObjectiveView } from "@/lib/rpg/types";

/**
 * The goal checklist. A tick only ever appears because the SERVER confirmed the
 * objective — the client never marks one itself, which is the whole point of
 * the keyword verification on the API side.
 */
export function ObjectiveTracker({
  objectives,
  justCompleted,
  turn,
  maxTurns,
}: {
  objectives: ObjectiveView[];
  /** Ids confirmed by the last turn — these pulse once. */
  justCompleted: string[];
  turn: number;
  maxTurns: number;
}) {
  const requiredLeft = objectives.filter((o) => o.required && !o.done).length;

  return (
    <div className="rounded-[var(--radius)] border border-border bg-bg-secondary/80 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-content-secondary">
        <span>Vazifalar</span>
        <span className={cn("tabular-nums", turn >= maxTurns - 2 && "text-accent-red")}>
          {turn}/{maxTurns} navbat
        </span>
      </div>

      <ul className="space-y-1.5">
        {objectives.map((o) => {
          const pulsing = justCompleted.includes(o.id);
          return (
            <li key={o.id} className="flex items-start gap-2 text-xs">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={o.done ? "done" : "open"}
                  initial={{ scale: pulsing ? 0.4 : 1, opacity: pulsing ? 0 : 1 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 16 }}
                  className="mt-0.5 shrink-0"
                >
                  {o.done ? (
                    <Check className="h-3.5 w-3.5 text-accent-green" />
                  ) : o.required ? (
                    <Circle className="h-3.5 w-3.5 text-content-secondary" />
                  ) : (
                    <Star className="h-3.5 w-3.5 text-accent-yellow/70" />
                  )}
                </motion.span>
              </AnimatePresence>

              <span
                className={cn(
                  o.done ? "text-content-secondary line-through" : "text-content-primary",
                  !o.required && !o.done && "text-content-secondary"
                )}
              >
                {o.title_uz}
                {!o.required && (
                  <span className="ml-1 text-[10px] text-accent-yellow/80">qo&apos;shimcha</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {requiredLeft === 0 && (
        <p className="mt-2 border-t border-border pt-2 text-[11px] text-accent-green">
          Barcha asosiy vazifalar bajarildi — suhbatni yakunlashingiz mumkin.
        </p>
      )}
    </div>
  );
}
