import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback, parseJSONFromText } from "@/lib/gemini";
import { getAuth } from "@/lib/supabaseServer";
import { appendSpeakingMemory, loadSpeakingMemory } from "@/lib/speakingMemory";

// Off-critical-path analysis of one user turn. Runs on a small, fast text
// model while the examiner's voice is already playing, so it never delays the
// conversation. Produces the on-screen correction / vocab tip and updates the
// long-term memory (facts, weak points, topics).
const ANALYZE_MODELS = [
  process.env.PARTNER_ANALYZE_MODEL || "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
];

const strList = (v: unknown, max = 3) =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).slice(0, 120)).slice(0, max)
    : [];

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const transcript = String(body?.transcript || "").slice(0, 2000).trim();
    const question = String(body?.question || "").slice(0, 400);
    const mode = body?.mode === "exam" ? "exam" : "chat";
    if (!transcript) return NextResponse.json({ correction: null, vocab_tip: null });

    const prompt = `You are an IELTS speaking coach reviewing ONE spoken answer from an Uzbek learner of English.
Question they answered: "${question || "(unknown)"}"
Their exact words (verbatim transcript, may contain fillers): "${transcript}"

Return ONLY JSON:
{
  "correction": { "you_said": "the faulty phrase", "better": "corrected phrase", "note": "one short note in Uzbek (Latin script) explaining the rule" } or null if there is no clear grammar/word-choice mistake,
  "vocab_tip": { "instead_of": "a basic word they used", "try": "a band 7+ alternative", "example": "one short example sentence" } or null if nothing worth upgrading,
  "remember": {
    "facts": ["short personal fact revealed (job, city, family, hobby...)"],
    "weak_points": ["mistake pattern, e.g. 'drops articles', 'past tense -ed missing'"],
    "topics": ["topic of this answer, 1-3 words"]
  }
}
Rules: only flag mistakes that are clearly present in the words above — never invent. Empty arrays are fine.${mode === "exam" ? " Be strict, like an examiner's notes." : ""}`;

    let parsed: any = {};
    try {
      const raw = await generateWithFallback([{ text: prompt }], {
        models: ANALYZE_MODELS,
        config: { maxOutputTokens: 300, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
      });
      parsed = parseJSONFromText(raw);
    } catch {
      return NextResponse.json({ correction: null, vocab_tip: null });
    }

    const correction =
      parsed.correction?.you_said && parsed.correction?.better
        ? {
            you_said: String(parsed.correction.you_said).slice(0, 200),
            better: String(parsed.correction.better).slice(0, 200),
            note: String(parsed.correction.note || "").slice(0, 300),
          }
        : null;
    const vocab_tip =
      parsed.vocab_tip?.try
        ? {
            instead_of: String(parsed.vocab_tip.instead_of || "").slice(0, 100),
            try: String(parsed.vocab_tip.try).slice(0, 100),
            example: String(parsed.vocab_tip.example || "").slice(0, 200),
          }
        : null;

    const rem = parsed.remember || {};
    const delta = {
      facts: strList(rem.facts),
      weak_points: strList(rem.weak_points),
      topics: strList(rem.topics),
    };
    if (correction) delta.weak_points.push(`${correction.you_said} -> ${correction.better}`.slice(0, 120));
    if (delta.facts.length || delta.weak_points.length || delta.topics.length) {
      const memory = await loadSpeakingMemory(supabase, user.id);
      await appendSpeakingMemory(supabase, user.id, memory, delta).catch(() => {});
    }

    return NextResponse.json({ correction, vocab_tip });
  } catch (e) {
    console.error("analyze error:", e);
    return NextResponse.json({ correction: null, vocab_tip: null });
  }
}
