"use client";

import { cn } from "@/lib/utils";
import type { GroupQuestion, QuestionGroup } from "@/lib/types";

interface QuestionRendererProps {
  groups: QuestionGroup[];
  answers: Record<number, string>;
  onAnswer: (questionNum: number, answer: string) => void;
  showFeedback?: boolean;
}

function isCorrect(q: GroupQuestion, answer?: string) {
  if (!q.correct_answer || !answer) return false;
  return answer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
}

export function QuestionRenderer({
  groups,
  answers,
  onAnswer,
  showFeedback = false,
}: QuestionRendererProps) {
  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <div
          key={gi}
          className="rounded-[var(--radius)] border border-border bg-bg-tertiary p-5"
        >
          {group.group_instructions && (
            <p className="mb-3 text-sm italic text-content-secondary">
              {group.group_instructions}
            </p>
          )}
          {group.title && (
            <h3 className="mb-3 font-semibold text-content-primary">{group.title}</h3>
          )}

          {/* Shared option/heading legend for matching variants */}
          {(group.match_options || group.headings_list) && (
            <div className="mb-4 rounded-[var(--radius)] bg-bg-secondary p-3 text-sm">
              {group.match_options &&
                Object.entries(group.match_options).map(([k, v]) => (
                  <p key={k} className="text-content-primary">
                    <span className="font-bold text-accent">{k}.</span> {v}
                  </p>
                ))}
              {group.headings_list?.map((h, i) => (
                <p key={i} className="text-content-primary">
                  {h}
                </p>
              ))}
            </div>
          )}

          {/* Summary text (summary_completion) */}
          {group.summary_text && (
            <p className="mb-4 whitespace-pre-line text-sm leading-7 text-content-primary">
              {group.summary_text}
            </p>
          )}

          <div className="space-y-4">
            {group.questions.map((q) => (
              <QuestionItem
                key={q.number}
                q={q}
                group={group}
                answer={answers[q.number]}
                onAnswer={onAnswer}
                showFeedback={showFeedback}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionItem({
  q,
  group,
  answer,
  onAnswer,
  showFeedback,
}: {
  q: GroupQuestion;
  group: QuestionGroup;
  answer?: string;
  onAnswer: (n: number, v: string) => void;
  showFeedback: boolean;
}) {
  const type = q.type || group.group_type;
  const correct = isCorrect(q, answer);

  // --- Text input types (gap fill / form / table / summary) ---
  if (
    type === "gap_filling" ||
    type === "form_completion" ||
    type === "table_completion" ||
    type === "map_labelling"
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[24px] text-sm font-bold text-accent">{q.number}</span>
        {q.before_gap && <span className="text-sm text-content-primary">{q.before_gap}</span>}
        <input
          type="text"
          placeholder={q.answer_format || `Answer ${q.number}`}
          value={answer || ""}
          onChange={(e) => onAnswer(q.number, e.target.value)}
          className={cn(
            "min-w-[120px] border-b-2 bg-transparent px-2 py-1 text-center text-sm focus:outline-none",
            showFeedback
              ? correct
                ? "border-green-500 text-green-500"
                : "border-accent-red text-accent-red"
              : "border-border focus:border-accent"
          )}
        />
        {q.after_gap && <span className="text-sm text-content-primary">{q.after_gap}</span>}
        {showFeedback && !correct && q.correct_answer && (
          <span className="text-xs text-green-500">✓ {q.correct_answer}</span>
        )}
      </div>
    );
  }

  // --- Multiple choice ---
  if (type === "multiple_choice") {
    return (
      <div>
        <p className="mb-2 text-sm text-content-primary">
          <span className="mr-2 font-bold text-accent">{q.number}.</span>
          {q.question}
        </p>
        <div className="ml-6 space-y-2">
          {Object.entries(q.options || {}).map(([letter, text]) => {
            const selected = answer === letter;
            const showCorrect = showFeedback && letter === q.correct_answer;
            const showWrong = showFeedback && selected && letter !== q.correct_answer;
            return (
              <label
                key={letter}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border p-3 transition-colors",
                  showWrong
                    ? "border-accent-red bg-accent-red/15"
                    : showCorrect
                    ? "border-green-500 bg-green-500/15"
                    : selected
                    ? "border-accent bg-accent/15"
                    : "border-border bg-bg-secondary hover:border-accent/40"
                )}
              >
                <input
                  type="radio"
                  name={`q_${q.number}`}
                  value={letter}
                  checked={selected}
                  onChange={() => onAnswer(q.number, letter)}
                  className="hidden"
                />
                <span className="w-5 font-bold text-accent">{letter}</span>
                <span className="text-sm text-content-primary">{text}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Matching (dropdown) ---
  if (type === "matching" || type === "matching_headings") {
    const options = group.match_options
      ? Object.keys(group.match_options)
      : group.headings_list?.map((_, i) => String(i + 1)) || [];
    const label = type === "matching_headings" ? `Paragraph ${q.paragraph}` : q.item;
    return (
      <div className="flex items-center gap-3">
        <span className="w-5 text-sm font-bold text-accent">{q.number}</span>
        <span className="flex-1 text-sm text-content-primary">{label}</span>
        <select
          value={answer || ""}
          onChange={(e) => onAnswer(q.number, e.target.value)}
          className={cn(
            "rounded-[var(--radius)] border bg-bg-secondary px-3 py-2 text-sm focus:outline-none focus:border-accent",
            showFeedback
              ? correct
                ? "border-green-500"
                : "border-accent-red"
              : "border-border"
          )}
        >
          <option value="">Select...</option>
          {group.match_options
            ? Object.entries(group.match_options).map(([k, v]) => (
                <option key={k} value={k}>
                  {k}. {v}
                </option>
              ))
            : options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
        </select>
        {showFeedback && !correct && q.correct_answer && (
          <span className="text-xs text-green-500">✓ {q.correct_answer}</span>
        )}
      </div>
    );
  }

  // --- True/False/Not Given & Yes/No/Not Given ---
  if (type === "true_false_not_given" || type === "yes_no_notgiven") {
    const opts =
      type === "yes_no_notgiven"
        ? ["YES", "NO", "NOT GIVEN"]
        : ["TRUE", "FALSE", "NOT GIVEN"];
    return (
      <div>
        <p className="mb-2 text-sm text-content-primary">
          <span className="mr-2 font-bold text-accent">{q.number}.</span>
          {q.statement}
        </p>
        <div className="ml-6 flex flex-wrap gap-2">
          {opts.map((opt) => {
            const selected = answer === opt;
            const showCorrect = showFeedback && opt === q.correct_answer;
            const showWrong = showFeedback && selected && opt !== q.correct_answer;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswer(q.number, opt)}
                className={cn(
                  "rounded-[var(--radius)] border px-4 py-2 text-xs font-semibold transition-colors",
                  showWrong
                    ? "border-accent-red bg-accent-red text-white"
                    : showCorrect
                    ? "border-green-500 bg-green-500 text-white"
                    : selected
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-bg-secondary text-content-secondary hover:border-accent/40"
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Matching information (which paragraph) ---
  if (type === "matching_information") {
    return (
      <div className="flex items-center gap-3">
        <span className="w-5 text-sm font-bold text-accent">{q.number}</span>
        <span className="flex-1 text-sm text-content-primary">{q.statement}</span>
        <input
          type="text"
          placeholder="Paragraph"
          value={answer || ""}
          onChange={(e) => onAnswer(q.number, e.target.value)}
          className={cn(
            "w-24 border-b-2 bg-transparent px-2 py-1 text-center text-sm focus:outline-none",
            showFeedback
              ? correct
                ? "border-green-500 text-green-500"
                : "border-accent-red text-accent-red"
              : "border-border focus:border-accent"
          )}
        />
        {showFeedback && !correct && q.correct_answer && (
          <span className="text-xs text-green-500">✓ {q.correct_answer}</span>
        )}
      </div>
    );
  }

  // --- Fallback: plain text input ---
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-sm font-bold text-accent">{q.number}</span>
      <span className="flex-1 text-sm text-content-primary">{q.question || q.statement}</span>
      <input
        type="text"
        value={answer || ""}
        onChange={(e) => onAnswer(q.number, e.target.value)}
        className="min-w-[120px] border-b-2 border-border bg-transparent px-2 py-1 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}
