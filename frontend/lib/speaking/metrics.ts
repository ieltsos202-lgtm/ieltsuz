/**
 * Objective session metrics.
 *
 * The band itself stays a model judgement, but fluency evidence should not be:
 * filler density, speaking rate and vocabulary spread are countable. We compute
 * them from the transcript plus the measured speaking time, feed them to the
 * report prompt as hard evidence, and show them to the candidate so progress is
 * visible between sessions.
 */

export interface SessionMetrics {
  /** Total words the candidate produced. */
  words: number;
  /** Measured seconds the candidate actually held the floor. */
  speaking_seconds: number;
  /** Words per minute over speaking time (0 when the time is unknown). */
  words_per_minute: number;
  /** Average words per answer. */
  words_per_answer: number;
  filler_count: number;
  /** Fillers per 100 words. */
  filler_rate: number;
  /** Distinct words / total words, 0-1. Higher = wider active vocabulary. */
  vocabulary_diversity: number;
  /** Words used 4+ times (excluding function words), most frequent first. */
  overused_words: string[];
  answers: number;
}

const FILLERS = [
  "um",
  "uh",
  "erm",
  "er",
  "ah",
  "hmm",
  "like",
  "you know",
  "i mean",
  "kind of",
  "sort of",
  "actually",
  "basically",
  "yani",
  "anaqa",
  "nima desam",
];

/** Function words carry no lexical-range signal, so they can't be "overused". */
const STOP_WORDS = new Set(
  ("a an the and or but if so because as of to in on at for with from by about into over after " +
    "is am are was were be been being do does did doing have has had having will would can could " +
    "shall should may might must i you he she it we they me him her us them my your his its our " +
    "their this that these those there here what which who whom when where why how not no yes very " +
    "too also just really quite more most much many some any all every than then now well ok okay")
    .split(" ")
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countFillers(text: string): number {
  const lower = ` ${text.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ")} `;
  let total = 0;
  for (const filler of FILLERS) {
    const re = new RegExp(`(?<=\\s)${filler.replace(/ /g, "\\s+")}(?=\\s)`, "g");
    total += (lower.match(re) || []).length;
  }
  return total;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeSessionMetrics(
  answers: string[],
  speakingSeconds: number
): SessionMetrics {
  const texts = answers.filter((a) => a && a.trim().length > 0);
  const allWords = texts.flatMap(words);
  const total = allWords.length;

  const counts = new Map<string, number>();
  for (const w of allWords) {
    if (w.length < 3 || STOP_WORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  const overused = Array.from(counts.entries())
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  const fillers = texts.reduce((n, t) => n + countFillers(t), 0);
  const seconds = Math.max(0, Math.round(speakingSeconds));

  return {
    words: total,
    speaking_seconds: seconds,
    words_per_minute: seconds > 0 ? Math.round((total / seconds) * 60) : 0,
    words_per_answer: texts.length ? Math.round(total / texts.length) : 0,
    filler_count: fillers,
    filler_rate: total ? round1((fillers / total) * 100) : 0,
    vocabulary_diversity: total ? round1(new Set(allWords).size / total) : 0,
    overused_words: overused,
    answers: texts.length,
  };
}

/** Compact, prompt-friendly rendering of the measured numbers. */
export function describeMetrics(m: SessionMetrics): string {
  return [
    `Answers: ${m.answers}`,
    `Words: ${m.words}`,
    m.speaking_seconds ? `Speaking time: ${m.speaking_seconds}s` : null,
    m.words_per_minute ? `Speaking rate: ${m.words_per_minute} wpm` : null,
    `Average answer length: ${m.words_per_answer} words`,
    `Filler words: ${m.filler_count} (${m.filler_rate} per 100 words)`,
    `Vocabulary diversity (distinct/total): ${m.vocabulary_diversity}`,
    m.overused_words.length ? `Repeated content words: ${m.overused_words.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
