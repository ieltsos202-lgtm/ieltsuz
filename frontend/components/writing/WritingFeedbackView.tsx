"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Plus, BookOpen } from "lucide-react";

import { apiPost } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedBand } from "@/components/shared/AnimatedBand";
import { CriterionCard } from "@/components/shared/CriterionCard";
import type { WritingFeedback, VocabularyWord } from "@/lib/types";

export function WritingFeedbackView({
  feedback,
  onPracticeAgain,
}: {
  feedback: WritingFeedback;
  onPracticeAgain: () => void;
}) {
  const [showModel, setShowModel] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const cf = feedback.criterion_feedback || {};

  const addWord = async (w: VocabularyWord) => {
    try {
      await apiPost("/api/vocabulary", {
        word: w.word,
        definition: w.definition,
        example: w.example,
        source: "writing",
      });
      setAdded((s) => ({ ...s, [w.word]: true }));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
        <p className="text-sm text-content-secondary">Overall Band</p>
        <AnimatedBand target={feedback.band_score} className="text-6xl" />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <CriterionCard label="Task Achievement" score={feedback.task_achievement} note={cf.task_achievement} />
        <CriterionCard label="Coherence & Cohesion" score={feedback.coherence_cohesion} note={cf.coherence_cohesion} />
        <CriterionCard label="Lexical Resource" score={feedback.lexical_resource} note={cf.lexical_resource} />
        <CriterionCard label="Grammatical Range" score={feedback.grammatical_range} note={cf.grammatical_range} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2 text-accent-green">
            <CheckCircle2 className="h-5 w-5" /> Strengths
          </CardTitle>
          <ul className="mt-3 space-y-2">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-accent-green">✓</span> {s}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2 text-accent-yellow">
            <AlertTriangle className="h-5 w-5" /> Improvements
          </CardTitle>
          <ul className="mt-3 space-y-2">
            {feedback.improvements.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-accent-yellow">⚠</span> {s}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {feedback.sentence_corrections?.length > 0 && (
        <Card>
          <CardTitle>Sentence analysis</CardTitle>
          <div className="mt-3 space-y-4">
            {feedback.sentence_corrections.map((c, i) => (
              <div key={i} className="rounded-[var(--radius)] bg-bg-tertiary p-4">
                <p className="text-sm text-accent-red line-through decoration-accent-red/50">
                  {c.original}
                </p>
                <p className="mt-1 text-sm text-accent-green">{c.corrected}</p>
                <p className="mt-2 text-xs text-content-secondary">{c.explanation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" /> Model answer
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowModel((v) => !v)}>
            {showModel ? "Hide" : "What a Band 8 answer looks like"}
          </Button>
        </div>
        {showModel && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">
            {feedback.model_answer}
          </p>
        )}
      </Card>

      {feedback.new_vocabulary?.length > 0 && (
        <Card>
          <CardTitle>New vocabulary</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {feedback.new_vocabulary.map((w) => (
              <div key={w.word} className="rounded-[var(--radius)] bg-bg-tertiary p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{w.word}</span>
                  <button
                    onClick={() => addWord(w)}
                    disabled={added[w.word]}
                    className="flex items-center gap-1 text-xs text-accent hover:underline disabled:text-content-secondary"
                  >
                    <Plus className="h-3 w-3" />
                    {added[w.word] ? "Added" : "Add"}
                  </button>
                </div>
                <p className="mt-1 text-sm text-content-secondary">{w.definition}</p>
                <p className="mt-1 text-xs italic text-content-secondary">{w.example}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="gradient" onClick={onPracticeAgain}>
          Practice Again
        </Button>
        <a href="/progress">
          <Button variant="outline">View Progress</Button>
        </a>
      </div>
    </div>
  );
}
