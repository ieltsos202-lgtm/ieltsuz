import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { generateJSON } from "@/lib/gemini";
import { rateLimit } from "@/lib/rateLimit";

// Given a word selected while reading/listening, generate its IELTS-friendly
// definition, Uzbek translation, IPA pronunciation and two example sentences,
// then save it to the user's vocabulary. Returns the saved record.
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rawWord: string = (body.word || "").trim();
    const context: string = (body.context || "").trim().slice(0, 400);
    const source: string = body.source || "reading";

    if (!rawWord || rawWord.length > 60) {
      return NextResponse.json({ error: "Invalid word" }, { status: 400 });
    }

    // Each new word is a paid AI call — cap per user.
    if (rateLimit(`vocab-lookup:${user.id}`, 60, 10 * 60_000)) {
      return NextResponse.json({ error: "Juda ko'p so'rov." }, { status: 429 });
    }

    // Normalize for duplicate detection (strip surrounding punctuation).
    const word = rawWord.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "") || rawWord;

    // Already saved? Return the existing record (idempotent "add").
    const { data: existing } = await supabase
      .from("vocabulary")
      .select("*")
      .eq("user_id", user.id)
      .ilike("word", word)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ...existing[0], already_saved: true });
    }

    const prompt = `You are an IELTS vocabulary coach for Uzbek learners.
For the English word or phrase "${word}"${
      context ? ` (used in this sentence: "${context}")` : ""
    }, return STRICT JSON with these keys:
{
  "word": "the base/lemma form, lowercase",
  "phonetic": "IPA pronunciation in slashes, e.g. /əˈbʌndənt/",
  "definition": "a concise English definition suited to IELTS learners",
  "translation": "the Uzbek (o'zbekcha) translation",
  "examples": ["one natural example sentence", "a second example sentence"]
}
Use the meaning that fits the given context. Keep examples short and clear. Output JSON only.`;

    let detail: any = {};
    try {
      detail = await generateJSON(prompt);
    } catch {
      // Fall back to saving the bare word if AI is unavailable.
      detail = {};
    }

    const examples: string[] = Array.isArray(detail.examples)
      ? detail.examples.filter((e: any) => typeof e === "string" && e.trim()).slice(0, 3)
      : [];

    const record = {
      user_id: user.id,
      word: (detail.word || word).toString().slice(0, 60),
      definition: detail.definition ?? null,
      translation: detail.translation ?? null,
      phonetic: detail.phonetic ?? null,
      example: examples[0] ?? null,
      examples: examples.length ? examples : null,
      source,
    };

    const { data, error } = await supabase
      .from("vocabulary")
      .insert(record)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data?.[0] || record);
  } catch {
    return NextResponse.json({ error: "Failed to add word" }, { status: 500 });
  }
}
