"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb, RotateCcw, Send, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SentenceBuilder, SuggestedReply } from "@/lib/rpg/types";

/**
 * The answer area. Its shape IS the difficulty setting:
 *   level 1 — pick one of three offered replies
 *   level 2 — assemble a sentence from word tiles
 *   level 3 — type freely, with a hint available
 *
 * Whatever the mode, the component hands the parent one finished sentence, so
 * the API only ever deals with plain text.
 */
export function LevelInput({
  mode,
  disabled,
  suggestions,
  builder,
  hint,
  onSend,
  onHint,
  onDismissHint,
}: {
  mode: "choices" | "tiles" | "text" | "voice";
  disabled: boolean;
  suggestions: SuggestedReply[] | null;
  builder: SentenceBuilder | null;
  hint: { hint: string; starter: string } | null;
  onSend: (message: string, tiles?: string[]) => void;
  onHint: () => void;
  onDismissHint: () => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // A new set of tiles means a new question — clear whatever was half-built.
  useEffect(() => {
    setPicked([]);
  }, [builder]);

  // Shuffled once per tile set, so the correct order is never just left-to-right.
  const pool = useMemo(() => {
    if (!builder) return [];
    return [...builder.words]
      .map((w) => ({ w, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map(({ w }, i) => ({ word: w, id: `${w}-${i}` }));
  }, [builder]);

  const remaining = useMemo(() => {
    const used = [...picked];
    return pool.filter((t) => {
      const i = used.indexOf(t.word);
      if (i === -1) return true;
      used.splice(i, 1);
      return false;
    });
  }, [pool, picked]);

  if (mode === "choices") {
    return (
      <div className="space-y-2">
        {!suggestions?.length ? (
          <p className="py-3 text-center text-xs text-content-secondary">
            Javob variantlari yuklanmadi — qaytadan urinib ko&apos;ring.
          </p>
        ) : (
          suggestions.map((s, i) => (
            <motion.button
              key={`${s.text}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              disabled={disabled}
              onClick={() => onSend(s.text)}
              className={cn(
                "w-full rounded-[var(--radius)] border border-border bg-bg-secondary px-4 py-3 text-left text-sm text-content-primary transition-colors",
                "hover:border-accent hover:bg-bg-tertiary disabled:opacity-50"
              )}
            >
              {s.text}
            </motion.button>
          ))
        )}
      </div>
    );
  }

  if (mode === "tiles") {
    const sentence = picked.join(" ");
    return (
      <div className="space-y-3">
        <div className="min-h-[52px] rounded-[var(--radius)] border border-dashed border-border bg-bg-secondary p-2">
          {picked.length === 0 ? (
            <p className="px-1 py-2 text-xs text-content-secondary">
              So&apos;zlarni bosib gap tuzing
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((w, i) => (
                <button
                  key={`${w}-${i}`}
                  disabled={disabled}
                  onClick={() => setPicked((p) => p.filter((_, idx) => idx !== i))}
                  className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white"
                >
                  {w}
                  <X className="h-3 w-3 opacity-70" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {remaining.map((t) => (
            <button
              key={t.id}
              disabled={disabled}
              onClick={() => setPicked((p) => [...p, t.word])}
              className="rounded-md border border-border bg-bg-tertiary px-2.5 py-1.5 text-xs font-medium text-content-primary transition-colors hover:border-accent disabled:opacity-50"
            >
              {t.word}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !picked.length}
            onClick={() => setPicked([])}
          >
            <RotateCcw className="h-4 w-4" /> Tozalash
          </Button>
          <Button
            variant="gradient"
            size="sm"
            className="flex-1"
            disabled={disabled || picked.length < 2}
            onClick={() => {
              onSend(sentence, picked);
              setPicked([]);
            }}
          >
            <Send className="h-4 w-4" /> Yuborish
          </Button>
        </div>
      </div>
    );
  }

  // Levels 3+ (voice arrives in Phase 3 and falls back to typing until then).
  return (
    <div className="space-y-2">
      {hint && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-accent-yellow/40 bg-accent-yellow/10 p-3 text-xs">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-yellow" />
          <div className="flex-1">
            <p className="text-content-secondary">{hint.hint}</p>
            <button
              onClick={() => setText(hint.starter)}
              className="mt-1 text-left font-medium text-content-primary underline decoration-dotted"
            >
              {hint.starter}
            </button>
          </div>
          <button onClick={onDismissHint} aria-label="Yopish">
            <X className="h-3.5 w-3.5 text-content-secondary" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          disabled={disabled}
          rows={1}
          maxLength={300}
          placeholder="Inglizcha javob yozing..."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line — standard chat feel.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !disabled) {
                onSend(text.trim());
                setText("");
              }
            }
          }}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-[var(--radius)] border border-border bg-bg-secondary px-3 py-2.5 text-sm text-content-primary placeholder:text-content-secondary focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <Button variant="ghost" size="icon" disabled={disabled} onClick={onHint} title="Yordam">
          <Lightbulb className="h-4 w-4" />
        </Button>
        <Button
          variant="gradient"
          size="icon"
          disabled={disabled || !text.trim()}
          onClick={() => {
            onSend(text.trim());
            setText("");
          }}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-right text-[10px] text-content-secondary">{text.length}/300</p>
    </div>
  );
}
