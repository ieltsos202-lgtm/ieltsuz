"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ParsedQuestion } from "@/lib/types";

export function QuestionSheet({
  questions,
  fallbackCount,
  startOffset = 0,
  answers,
  onChange,
}: {
  questions: ParsedQuestion[];
  fallbackCount: number;
  startOffset?: number;
  answers: Record<string, string>;
  onChange: (num: number, value: string) => void;
}) {
  // When PDF parsing yields no structured questions, show a numbered answer grid
  // so the test is always usable.
  if (!questions || questions.length === 0) {
    return (
      <div>
        <p className="mb-3 text-sm text-content-secondary">
          Enter your answers for each question number.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: fallbackCount }, (_, i) => i + 1 + startOffset).map((n) => (
            <label key={n} className="flex items-center gap-2">
              <span className="w-6 text-right text-sm text-content-secondary">{n}.</span>
              <Input
                value={answers[String(n)] || ""}
                onChange={(e) => onChange(n, e.target.value)}
                className="h-9"
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {questions.map((q) => (
        <div key={q.number} className="rounded-[var(--radius)] bg-bg-tertiary p-4">
          <p className="mb-2 text-sm font-medium">
            <span className="text-accent">{q.number}.</span>{" "}
            {q.question || q.context || ""}
          </p>
          {q.type === "multiple_choice" && q.options ? (
            <div className="space-y-2">
              {Object.entries(q.options).map(([letter, text]) => {
                const selected = answers[String(q.number)] === letter;
                return (
                  <button
                    key={letter}
                    onClick={() => onChange(q.number, letter)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[var(--radius)] border p-2.5 text-left text-sm transition-colors",
                      selected
                        ? "border-accent bg-accent/15"
                        : "border-border hover:border-accent/40"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
                        selected ? "border-accent bg-accent text-white" : "border-border"
                      )}
                    >
                      {letter}
                    </span>
                    {text}
                  </button>
                );
              })}
            </div>
          ) : (
            <Input
              value={answers[String(q.number)] || ""}
              onChange={(e) => onChange(q.number, e.target.value)}
              placeholder={q.placeholder || `Answer ${q.number}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
