import { generateWithFallback, parseJSONFromText } from "@/lib/gemini";

/**
 * The speaking examiner's helper agents. The old pipeline made ONE Gemini call
 * transcribe the audio, understand it, correct it AND write the reply — slow,
 * and every extra job added dead air before the first word of the reply.
 *
 * Now the work is split across specialised agents:
 *
 *   Agent 2 — EAR (transcribeAudio):      audio -> verbatim transcript, fast.
 *   Agent 3 — ANALYST (analyzeTurn):      audio + transcript -> pronunciation,
 *                                         grammar, vocab, memory. Off-path.
 *   Agent 4 — SCORER (evalTurn):          transcript -> per-turn band estimates
 *                                         so the final report is pre-computed.
 *
 * Agent 1 — the examiner's brain — lives in the live route itself (it writes
 * the spoken reply from the transcript the Ear produced).
 */

// Audio understanding needs a capable model; lite is kept only as last resort.
const EAR_MODELS = [
  process.env.SPEAKING_STT_MODEL || "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
];
const ANALYST_MODELS = [
  process.env.PARTNER_ANALYZE_MODEL || "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
];
// Text-only scoring is cheap — the lite model is fast and good enough.
const SCORER_MODELS = [
  process.env.SPEAKING_EVAL_MODEL || "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

const FAST_CONFIG = { maxOutputTokens: 400, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } };

/* ------------------------------------------------------------------ */
/* Agent 2 — EAR                                                       */
/* ------------------------------------------------------------------ */

/**
 * Verbatim transcription of one recorded turn. Runs on the critical path, so
 * the prompt is deliberately tiny — no persona, no rules beyond "write exactly
 * what you hear". A rough draft from the browser's SpeechRecognition is passed
 * as a hint: it is often wrong on Uzbek-accented English, but it biases the
 * model toward the words the speaker actually intended.
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  lastQuestion: string,
  draft: string
): Promise<string> {
  const prompt = `Transcribe this audio EXACTLY, word for word — nothing else.
The speaker is an Uzbek learner of English answering the question: "${lastQuestion || "(unknown)"}"
- Expect an Uzbek accent: "th" may sound like "t/s/d", "w" like "v", dropped -s/-ed endings, shifted vowels, Uzbek or Russian words mixed in (write those in Uzbek Latin).
- Keep their grammar mistakes, false starts and fillers — do NOT clean up or paraphrase.
- Use the question to resolve ambiguous words: a word that fits the question is more likely than a random homophone.
- If a fragment is genuinely unintelligible write [unclear] for it. If the audio is silence or pure noise, output an empty string.
${draft ? `- A rough auto-transcript exists (may contain errors — trust your own ears first): "${draft}"\n` : ""}Output ONLY the transcript.`;

  const text = await generateWithFallback(
    [
      { text: prompt },
      { inlineData: { mimeType, data: audioBase64 } },
    ],
    { models: EAR_MODELS, jsonMode: false, config: { ...FAST_CONFIG, maxOutputTokens: 500 } }
  );
  return (text || "").trim();
}

/* ------------------------------------------------------------------ */
/* Agent 3 — ANALYST                                                   */
/* ------------------------------------------------------------------ */

export interface TurnAnalysis {
  correction: { you_said: string; better: string; note: string } | null;
  vocab_tip: { instead_of: string; try: string; example: string } | null;
  pronunciation: { issue: string; how_to_say: string; band: number | null } | null;
  remember: { facts: string[]; weak_points: string[]; topics: string[] };
}

/**
 * Deep per-turn analysis — the only agent that still listens to the audio, so
 * it owns pronunciation feedback. Runs off the critical path: its findings
 * fill the on-screen correction card, update long-term memory, and its
 * pronunciation note is injected into the NEXT examiner prompt so the coach
 * can voice the correction naturally without slowing this turn down.
 */
export async function analyzeTurn(
  audioBase64: string,
  mimeType: string,
  transcript: string,
  question: string,
  mode: "exam" | "chat"
): Promise<TurnAnalysis | null> {
  const prompt = `You are an IELTS speaking coach analysing ONE spoken answer from an Uzbek learner of English. You have BOTH the audio and its transcript.
Question they answered: "${question || "(unknown)"}"
Transcript: "${transcript}"

LISTEN to the audio for pronunciation: word stress, "th"/"v"/"w" sounds, dropped -s/-ed endings, Uzbek vowel shifts, overall intelligibility.

Return ONLY JSON:
{
  "correction": { "you_said": "the faulty phrase", "better": "corrected phrase", "note": "one short note in Uzbek (Latin script) explaining the rule" } or null,
  "vocab_tip": { "instead_of": "a basic word they used", "try": "a band 7+ alternative", "example": "one short example sentence" } or null,
  "pronunciation": { "issue": "what you actually heard, e.g. 'think' sounded like 'sink', 'comfortable' stressed on the wrong syllable", "how_to_say": "one short Uzbek explanation of the correct pronunciation", "band": 6.0 } or null,
  "remember": {
    "facts": ["short personal fact revealed (job, city, family, hobby...)"],
    "weak_points": ["mistake pattern, e.g. 'drops articles', 'past tense -ed missing'"],
    "topics": ["topic of this answer, 1-3 words"]
  }
}
Rules: only flag mistakes clearly present — never invent. "band" is your pronunciation estimate for THIS answer (0-9, halves allowed) or null if the audio is unusable. Empty arrays are fine.${mode === "exam" ? " Be strict, like an examiner's notes." : ""}`;

  let parsed: any;
  try {
    const raw = await generateWithFallback(
      [
        { text: prompt },
        { inlineData: { mimeType, data: audioBase64 } },
      ],
      { models: ANALYST_MODELS, config: { ...FAST_CONFIG, maxOutputTokens: 500 } }
    );
    parsed = parseJSONFromText(raw);
  } catch {
    return null;
  }

  const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const strList = (v: unknown, max = 3) =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).slice(0, 120)).slice(0, max)
      : [];

  const correction =
    parsed?.correction?.you_said && parsed?.correction?.better
      ? {
          you_said: str(parsed.correction.you_said, 200),
          better: str(parsed.correction.better, 200),
          note: str(parsed.correction.note, 300),
        }
      : null;
  const vocab_tip = parsed?.vocab_tip?.try
    ? {
        instead_of: str(parsed.vocab_tip.instead_of, 100),
        try: str(parsed.vocab_tip.try, 100),
        example: str(parsed.vocab_tip.example, 200),
      }
    : null;
  const band = Number(parsed?.pronunciation?.band);
  const pronunciation = parsed?.pronunciation?.issue
    ? {
        issue: str(parsed.pronunciation.issue, 250),
        how_to_say: str(parsed.pronunciation.how_to_say, 300),
        band: Number.isFinite(band) && band > 0 ? Math.min(9, Math.max(0, band)) : null,
      }
    : null;

  const rem = parsed?.remember || {};
  return {
    correction,
    vocab_tip,
    pronunciation,
    remember: {
      facts: strList(rem.facts),
      weak_points: strList(rem.weak_points),
      topics: strList(rem.topics),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Agent 4 — SCORER                                                    */
/* ------------------------------------------------------------------ */

export interface TurnEval {
  fluency: number | null;
  lexical: number | null;
  grammar: number | null;
  /** Filled by the Analyst (it heard the audio), not the Scorer. */
  pronunciation: number | null;
  note: string;
}

/**
 * Running evaluation — scores each answer the moment it finishes, so the
 * end-of-test report is a merge of ready-made judgements instead of a cold
 * re-analysis of the whole session. Text-only: pronunciation is left null and
 * filled in from the Analyst's audio-based estimate.
 */
export async function evalTurn(
  transcript: string,
  question: string,
  part: number,
  durationSec: number
): Promise<TurnEval | null> {
  const prompt = `You are an IELTS examiner scoring ONE answer in a speaking test (Part ${part}).
Question: "${question || "(unknown)"}"
Answer (verbatim): "${transcript}"
Speaking time: ~${Math.round(durationSec)}s

Score THIS answer only on three criteria (0-9, halves allowed), plus one short evidence note quoting their words:
- fluency: length, hesitation, repetition, coherence
- lexical: vocabulary range and precision
- grammar: sentence variety and accuracy
Return ONLY JSON: {"fluency": 6.0, "lexical": 5.5, "grammar": 6.0, "note": "one short evidence note"}`;

  let parsed: any;
  try {
    const raw = await generateWithFallback([{ text: prompt }], {
      models: SCORER_MODELS,
      config: { ...FAST_CONFIG, maxOutputTokens: 200 },
    });
    parsed = parseJSONFromText(raw);
  } catch {
    return null;
  }

  const band = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(9, Math.max(0, n)) : null;
  };
  if (!parsed || (band(parsed.fluency) === null && band(parsed.grammar) === null)) return null;
  return {
    fluency: band(parsed.fluency),
    lexical: band(parsed.lexical),
    grammar: band(parsed.grammar),
    pronunciation: null,
    note: String(parsed.note || "").slice(0, 250),
  };
}
