"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Clock, Sprout, Trees } from "lucide-react";

import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { WordCard } from "@/lib/rpg/types";

type Filter = "all" | "new" | "learning" | "strong" | "due";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Hammasi" },
  { id: "new", label: "Yangi" },
  { id: "learning", label: "O'rganilmoqda" },
  { id: "strong", label: "Mustahkam" },
  { id: "due", label: "Takrorlash" },
];

interface WordsResponse {
  words: WordCard[];
  summary: { total: number; new: number; learning: number; strong: number; due: number };
}

export default function RpgWordsPage() {
  const [data, setData] = useState<WordsResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setData(await apiGet<WordsResponse>("/api/rpg/words"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "So'zlarni yuklab bo'lmadi");
      }
    })();
  }, []);

  const visible = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case "new":
        return data.words.filter((w) => w.stage === 0);
      case "learning":
        return data.words.filter((w) => w.stage >= 1 && w.stage <= 3);
      case "strong":
        return data.words.filter((w) => w.stage >= 4);
      case "due":
        return data.words.filter((w) => w.due);
      default:
        return data.words;
    }
  }, [data, filter]);

  if (error) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-sm text-content-secondary">{error}</p>
      </Card>
    );
  }

  if (!data) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/games/new-city"
        className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Xarita
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <BookOpen className="h-6 w-6 text-accent" /> So&apos;zlarim
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          Sahnalarda o&apos;rgangan so&apos;zlaringiz. Kuch darajasi vaqt o&apos;tishi bilan
          pasayadi — takrorlash kerak bo&apos;lgan so&apos;zlar keyingi sahnalarda qaytib keladi.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Jami" value={data.summary.total} icon={BookOpen} tone="text-accent" />
        <StatBox label="Yangi" value={data.summary.new} icon={Sprout} tone="text-accent-yellow" />
        <StatBox label="Mustahkam" value={data.summary.strong} icon={Trees} tone="text-accent-green" />
        <StatBox label="Takrorlash" value={data.summary.due} icon={Clock} tone="text-accent-red" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === f.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-content-secondary hover:text-content-primary"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-content-secondary">
            {data.summary.total === 0
              ? "Hali so'z yo'q — birinchi sahnani o'ynab ko'ring."
              : "Bu bo'limda so'z yo'q."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((w, i) => (
            <motion.div
              key={w.word}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
            >
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{w.word}</p>
                    {w.uz && <p className="truncate text-xs text-content-secondary">{w.uz}</p>}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      w.stage >= 4
                        ? "bg-accent-green/20 text-accent-green"
                        : w.stage >= 1
                        ? "bg-accent-yellow/20 text-accent-yellow"
                        : "bg-bg-tertiary text-content-secondary"
                    )}
                  >
                    {w.stage}/5
                  </span>
                </div>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${w.strength}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      w.strength >= 70
                        ? "bg-accent-green"
                        : w.strength >= 35
                        ? "bg-accent-yellow"
                        : "bg-accent-red"
                    )}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-content-secondary">
                  <span>{w.strength}%</span>
                  {w.due && (
                    <span className="flex items-center gap-1 text-accent-red">
                      <Clock className="h-3 w-3" /> takrorlash vaqti
                    </span>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof BookOpen;
  tone: string;
}) {
  return (
    <Card className="p-3 text-center">
      <Icon className={cn("mx-auto h-4 w-4", tone)} />
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-content-secondary">{label}</p>
    </Card>
  );
}
