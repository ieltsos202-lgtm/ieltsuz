"use client";

import { useEffect, useState } from "react";
import { Star, RotateCcw, Check, Volume2 } from "lucide-react";

import { apiGet, apiPatch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import type { VocabRecord, VocabStats } from "@/lib/types";

type Tab = "all" | "flashcards" | "review";

function isDue(w: VocabRecord): boolean {
  if (!w.next_review) return true;
  return new Date(w.next_review).getTime() <= Date.now();
}

function speak(word: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

function exampleList(w: VocabRecord): string[] {
  if (Array.isArray(w.examples) && w.examples.length) return w.examples;
  return w.example ? [w.example] : [];
}

function SpeakerButton({ word }: { word: string }) {
  return (
    <button
      onClick={() => speak(word)}
      title="Pronounce"
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent/15"
    >
      <Volume2 className="h-3.5 w-3.5" />
    </button>
  );
}

export default function VocabularyPage() {
  const [words, setWords] = useState<VocabRecord[]>([]);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [filter, setFilter] = useState<string>("all");

  const load = () => {
    Promise.all([
      apiGet<{ vocabulary: VocabRecord[] }>("/api/vocabulary"),
      apiGet<VocabStats>("/api/vocabulary/stats"),
    ])
      .then(([v, s]) => {
        setWords(v.vocabulary);
        setStats(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const review = async (id: string, known: boolean) => {
    try {
      await apiPatch(`/api/vocabulary/${id}/review`, { known });
    } finally {
      load();
    }
  };

  const sources = Array.from(new Set(words.map((w) => w.source).filter(Boolean))) as string[];
  const filtered =
    filter === "all"
      ? words
      : filter === "mastered"
      ? words.filter((w) => w.mastered)
      : filter === "learning"
      ? words.filter((w) => !w.mastered)
      : words.filter((w) => w.source === filter);

  const dueWords = words.filter(isDue);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vocabulary</h1>
        <p className="mt-1 text-content-secondary">
          Build and review the words you collect across all four skills.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-content-secondary">Total words</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-bold text-accent-green">{stats.mastered}</p>
            <p className="text-xs text-content-secondary">Mastered</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-bold text-accent-yellow">{stats.due}</p>
            <p className="text-xs text-content-secondary">Due for review</p>
          </Card>
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        {(["all", "flashcards", "review"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "border-b-2 border-accent text-content-primary"
                : "text-content-secondary hover:text-content-primary"
            )}
          >
            {t === "review" ? "Daily Review" : t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      {words.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-content-secondary">
            No words yet. While doing a Reading or Listening test, select any
            unknown word and tap <span className="font-medium text-accent">“+ Lug‘atga qo‘shish”</span> to
            save it here with its translation, pronunciation and example sentences.
          </p>
        </Card>
      ) : tab === "all" ? (
        <AllWords
          words={filtered}
          sources={sources}
          filter={filter}
          setFilter={setFilter}
        />
      ) : tab === "flashcards" ? (
        <Flashcards words={words} onReview={review} />
      ) : (
        <Flashcards words={dueWords} onReview={review} emptyLabel="No words due today. Great job!" />
      )}
    </div>
  );
}

function AllWords({
  words,
  sources,
  filter,
  setFilter,
}: {
  words: VocabRecord[];
  sources: string[];
  filter: string;
  setFilter: (f: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["all", "mastered", "learning", ...sources].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
              filter === f
                ? "border-accent bg-accent/15 text-content-primary"
                : "border-border text-content-secondary hover:border-accent/40"
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="p-3 font-medium">Word</th>
              <th className="p-3 font-medium">Meaning &amp; examples</th>
              <th className="p-3 font-medium">Source</th>
              <th className="p-3 font-medium">Mastered</th>
            </tr>
          </thead>
          <tbody>
            {words.map((w) => {
              const examples = exampleList(w);
              return (
                <tr key={w.id} className="border-b border-border/50 align-top">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{w.word}</span>
                      <SpeakerButton word={w.word} />
                    </div>
                    {w.phonetic && (
                      <p className="text-xs text-content-secondary">{w.phonetic}</p>
                    )}
                    {w.translation && (
                      <p className="mt-0.5 text-xs font-medium text-accent">{w.translation}</p>
                    )}
                  </td>
                  <td className="p-3 text-content-secondary">
                    <p>{w.definition || "—"}</p>
                    {examples.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {examples.map((ex, i) => (
                          <li key={i} className="text-xs italic">“{ex}”</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-3 capitalize text-content-secondary">{w.source || "—"}</td>
                  <td className="p-3">
                    {w.mastered ? (
                      <Star className="h-4 w-4 fill-accent-yellow text-accent-yellow" />
                    ) : (
                      <span className="text-content-secondary">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Flashcards({
  words,
  onReview,
  emptyLabel,
}: {
  words: VocabRecord[];
  onReview: (id: string, known: boolean) => void;
  emptyLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (words.length === 0) {
    return (
      <Card className="border-dashed">
        <p className="text-sm text-content-secondary">
          {emptyLabel || "No words available."}
        </p>
      </Card>
    );
  }

  const card = words[Math.min(index, words.length - 1)];

  const next = (known: boolean) => {
    onReview(card.id, known);
    setFlipped(false);
    setIndex((i) => (i + 1) % words.length);
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="text-center text-sm text-content-secondary">
        {index + 1} / {words.length}
      </p>
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-8 text-center transition-colors hover:border-accent/40"
      >
        {!flipped ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{card.word}</span>
              <span onClick={(e) => e.stopPropagation()}>
                <SpeakerButton word={card.word} />
              </span>
            </div>
            {card.phonetic && (
              <span className="text-sm text-content-secondary">{card.phonetic}</span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {card.translation && (
              <p className="text-lg font-semibold text-accent">{card.translation}</p>
            )}
            <p className="text-content-secondary">{card.definition || "—"}</p>
            {exampleList(card).map((ex, i) => (
              <p key={i} className="text-sm italic text-content-secondary">“{ex}”</p>
            ))}
          </div>
        )}
        <span className="mt-4 text-xs text-content-secondary">
          {flipped ? "Click to hide" : "Click to flip"}
        </span>
      </button>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => next(false)}>
          <RotateCcw className="h-4 w-4" /> Need practice
        </Button>
        <Button variant="gradient" className="flex-1" onClick={() => next(true)}>
          <Check className="h-4 w-4" /> I know it
        </Button>
      </div>
    </div>
  );
}
