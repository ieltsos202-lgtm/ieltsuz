import { NextRequest, NextResponse } from "next/server";
import { getModel, parseJSONFromText } from "@/lib/gemini";
import { getAuth } from "@/lib/supabaseServer";
import { describeMemory, loadSpeakingMemory, saveSpeakingMemory } from "@/lib/speakingMemory";

const MODEL = process.env.PARTNER_MODEL || "gemini-2.5-flash";

const VALID_EMOTIONS = [
  "happy", "laughing", "excited", "neutral", "thinking",
  "surprised", "sad", "annoyed", "encouraging",
];

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "exam" ? "exam" : "chat";
    const partnerName = String(body?.partner_name || "Adam").slice(0, 40);
    const userName = String(body?.user_name || "").split(" ")[0].slice(0, 40);

    const memory = await loadSpeakingMemory(supabase, user.id);
    const hour = new Date().getUTCHours() + 5; // Tashkent
    const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

    const prompt =
      mode === "exam"
        ? `You are ${partnerName}, a real British IELTS Speaking examiner starting a live mock test with ${userName || "the candidate"} (from Uzbekistan). It is ${timeOfDay} in Tashkent.

${describeMemory(memory, userName)}

Write your OPENING line (2-3 spoken sentences): greet them naturally, mention it's the speaking test, and ask the first Part 1 question (full name OR where they're from OR whether they work/study). Sound like a real person, not a script. If you remember them, casually show it in one short clause ("Back again, I see."). Never repeat these previous openings: ${memory.recent_greetings.slice(-6).map((g) => `"${g}"`).join(", ") || "(none)"}.

Return ONLY JSON: {"text": "...", "emotion": "neutral | happy | encouraging"}`
        : `You are ${partnerName} — ${userName || "this learner"}'s strict-but-lovable English mentor and friend. You are a real human: witty, sarcastic, warm British guy living in Tashkent who also speaks perfect Uzbek. It is ${timeOfDay} in Tashkent.

${describeMemory(memory, userName)}

Write your OPENING line for today's voice chat (2-4 short spoken sentences). Rules:
- NEVER start the same way twice. Previous openings you must NOT resemble: ${memory.recent_greetings.slice(-6).map((g) => `"${g}"`).join(", ") || "(none)"}.
- Vary the hook every time: a joke, a tease about last time, a reference to something you remember about them, a "so what are we doing today?" question, a mini-challenge, a fake-serious mood, etc.
- LANGUAGE: speak natural ENGLISH. Do NOT sprinkle Uzbek words into English sentences. You MAY add at most ONE separate, complete, grammatically perfect Uzbek sentence — only as a friendly scold or a promise to hunt a known mistake (e.g. "Bugun 'he go' desang, to'xtatib qo'yaman."). If you have nothing to scold, use zero Uzbek.
- If you remember weak points, tease them about it and promise to hunt that mistake today.
- End with ONE clear question that makes them talk.
- No emojis, no markdown, plain text for TTS.

Return ONLY JSON: {"text": "...", "emotion": "happy | laughing | excited | neutral | surprised | encouraging | annoyed"}`;

    const model = getModel(MODEL, true, {
      maxOutputTokens: 300,
      temperature: 1.15,
      thinkingConfig: { thinkingBudget: 0 },
    });

    let text = "";
    let emotion = mode === "exam" ? "neutral" : "happy";
    try {
      const res = await model.generateContent(prompt);
      const parsed = parseJSONFromText(res.response.text());
      if (typeof parsed.text === "string" && parsed.text.trim()) text = parsed.text.trim();
      if (VALID_EMOTIONS.includes(parsed.emotion)) emotion = parsed.emotion;
    } catch {
      /* fall through to fallback */
    }

    if (!text) {
      text =
        mode === "exam"
          ? `Good ${timeOfDay}${userName ? ", " + userName : ""}. I'm ${partnerName}, your examiner today. Let's begin. Can you tell me your full name, please?`
          : `Hey${userName ? " " + userName : ""}, it's ${partnerName}. Ready to work? Tell me — what did you actually do today besides scrolling Instagram?`;
    }

    await saveSpeakingMemory(supabase, user.id, {
      recent_greetings: [...memory.recent_greetings, text].slice(-8),
    });

    return NextResponse.json({ text, emotion });
  } catch (e) {
    console.error("greeting error:", e);
    return NextResponse.json({ error: "Greeting failed" }, { status: 500 });
  }
}
