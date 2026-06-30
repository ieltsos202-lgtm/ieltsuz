"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedBand } from "@/components/shared/AnimatedBand";
import { CriterionCard } from "@/components/shared/CriterionCard";
import { cn } from "@/lib/utils";
import type { SpeakingFeedback } from "@/lib/types";

export interface SpeakingAnswer {
  question: string;
  transcribed_text: string;
  feedback: SpeakingFeedback;
}

function avg(answers: SpeakingAnswer[], key: keyof SpeakingFeedback): number {
  const vals = answers
    .map((a) => a.feedback[key])
    .filter((v): v is number => typeof v === "number");
  if (!vals.length) return 0;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 2) / 2;
}

function AnswerAccordion({ answer, index }: { answer: SpeakingAnswer; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const fb = answer.feedback;
  return (
    <Card className="p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <span className="font-medium">
          Q{index + 1}: {answer.question}
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase text-content-secondary">You said</p>
            <p className="mt-1 text-sm text-content-primary">{answer.transcribed_text}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-accent-green">
              You should have said
            </p>
            <p className="mt-1 text-sm text-content-secondary">{fb.what_should_have_said}</p>
          </div>

          {fb.grammar_errors?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-content-secondary">
                Grammar
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {fb.grammar_errors.map((g, i) => (
                  <li key={i}>
                    <span className="text-accent-red line-through">{g.error}</span> →{" "}
                    <span className="text-accent-green">{g.correction}</span>
                    <span className="block text-xs text-content-secondary">{g.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fb.vocabulary_suggestions?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-content-secondary">
                Vocabulary
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {fb.vocabulary_suggestions.map((v, i) => (
                  <li key={i}>
                    <span className="text-content-secondary">{v.used}</span> →{" "}
                    <span className="text-accent">{v.better_alternative}</span>
                    <span className="block text-xs text-content-secondary">{v.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fb.pronunciation_tips?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-content-secondary">
                Pronunciation
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-content-secondary">
                {fb.pronunciation_tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-[var(--radius)] bg-bg-tertiary p-3">
            <p className="text-xs font-semibold uppercase text-accent">Model answer</p>
            <p className="mt-1 text-sm text-content-secondary">{fb.model_answer}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export function SpeakingFeedbackView({
  answers,
  onPracticeAgain,
}: {
  answers: SpeakingAnswer[];
  onPracticeAgain: () => void;
}) {
  const overall = avg(answers, "band_score");

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
        <p className="text-sm text-content-secondary">Speaking Band Score</p>
        <AnimatedBand target={overall} className="text-6xl" />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CriterionCard label="Fluency & Coherence" score={avg(answers, "fluency_coherence")} />
        <CriterionCard label="Lexical Resource" score={avg(answers, "lexical_resource")} />
        <CriterionCard label="Grammatical Range" score={avg(answers, "grammatical_range")} />
        <CriterionCard label="Pronunciation" score={avg(answers, "pronunciation")} />
      </div>

      <div>
        <CardTitle className="mb-3">Question-by-question analysis</CardTitle>
        <div className="space-y-3">
          {answers.map((a, i) => (
            <AnswerAccordion key={i} answer={a} index={i} />
          ))}
        </div>
      </div>

      <Card>
        <CardTitle>Overall feedback</CardTitle>
        <p className="mt-2 text-sm text-content-secondary">
          {answers[answers.length - 1]?.feedback.feedback}
        </p>
      </Card>

      <Button variant="gradient" onClick={onPracticeAgain}>
        Practice Again
      </Button>
    </div>
  );
}
