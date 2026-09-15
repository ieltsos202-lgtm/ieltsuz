import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback, parseJSONFromText } from "@/lib/gemini";
import { getAuth } from "@/lib/supabaseServer";
import { describeMemory, loadSpeakingMemory, saveSpeakingMemory } from "@/lib/speakingMemory";

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
    const startPart = mode === "exam" && [1, 2, 3].includes(Number(body?.part)) ? (Number(body.part) as 1 | 2 | 3) : 1;

    const memory = await loadSpeakingMemory(supabase, user.id);
    const hour = new Date().getUTCHours() + 5; // Tashkent
    const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const prevGreetings = memory.recent_greetings.slice(-6).map((g) => `"${g}"`).join(", ") || "(none)";

    const examOpening =
      startPart === 2
        ? `Write your OPENING (2-3 spoken sentences): greet them briefly, say you are going straight to Part 2, explain they have one minute to prepare and then should speak for one to two minutes, and announce the topic aloud. Choose a fresh IELTS Part 2 cue card the candidate has NOT done before (see memory). Also return it as "cue_card": {"topic": "Describe ...", "bullets": [4 short 'you should say' points, the last starting with 'and explain']}.`
        : startPart === 3
        ? `Write your OPENING (2-3 spoken sentences): greet them briefly, say you are going straight to Part 3 — the discussion — and ask ONE abstract, analytical question on a common IELTS Part 3 theme (society, technology, education, environment, work, culture). Prefer a theme the candidate has NOT discussed before (see memory).`
        : `Write your OPENING line (2-3 spoken sentences): greet them naturally, mention it's the speaking test, and ask the first Part 1 question (full name OR where they're from OR whether they work/study).`;

    const prompt =
      mode === "exam"
        ? `You are ${partnerName}, a real British IELTS Speaking examiner starting a live mock test with ${userName || "the candidate"} (from Uzbekistan). It is ${timeOfDay} in Tashkent.

${describeMemory(memory, userName)}

${examOpening} Sound like a real person, not a script. If you remember them, casually show it in one short clause ("Back again, I see."). Never repeat these previous openings: ${prevGreetings}.

Return ONLY JSON: {"text": "...", "emotion": "neutral | happy | encouraging"${startPart === 2 ? `, "cue_card": {"topic": "...", "bullets": ["...", "...", "...", "..."]}` : ""}}`
        : `You are ${partnerName} — ${userName || "this learner"}'s strict-but-lovable English mentor and friend. You are a real human: witty, sarcastic, warm British guy living in Tashkent who also speaks perfect Uzbek. It is ${timeOfDay} in Tashkent.

${describeMemory(memory, userName)}

Write your OPENING line for today's voice chat (2-4 short spoken sentences). Rules:
- NEVER start the same way twice. Previous openings you must NOT resemble: ${prevGreetings}.
- Vary the hook every time: a joke, a tease about last time, a reference to something you remember about them, a "so what are we doing today?" question, a mini-challenge, a fake-serious mood, etc.
- LANGUAGE: speak natural ENGLISH. Do NOT sprinkle Uzbek words into English sentences. You MAY add at most ONE separate, complete, grammatically perfect Uzbek sentence — only as a friendly scold or a promise to hunt a known mistake (e.g. "Bugun 'he go' desang, to'xtatib qo'yaman."). If you have nothing to scold, use zero Uzbek.
- If you remember weak points, tease them about it and promise to hunt that mistake today.
- End with ONE clear question that makes them talk.
- No emojis, no markdown, plain text for TTS.

Return ONLY JSON: {"text": "...", "emotion": "happy | laughing | excited | neutral | surprised | encouraging | annoyed"}`;

    let text = "";
    let emotion = mode === "exam" ? "neutral" : "happy";
    let cueCard: { topic: string; bullets: string[] } | null = null;
    try {
      const raw = await generateWithFallback([{ text: prompt }], {
        config: { maxOutputTokens: 300, temperature: 1.15, thinkingConfig: { thinkingBudget: 0 } },
      });
      const parsed = parseJSONFromText(raw);
      if (typeof parsed.text === "string" && parsed.text.trim()) text = parsed.text.trim();
      if (VALID_EMOTIONS.includes(parsed.emotion)) emotion = parsed.emotion;
      if (parsed.cue_card?.topic && Array.isArray(parsed.cue_card.bullets)) {
        cueCard = {
          topic: String(parsed.cue_card.topic),
          bullets: parsed.cue_card.bullets.slice(0, 4).map(String),
        };
      }
    } catch {
      /* fall through to fallback */
    }

    if (!text) {
      text =
        mode === "exam"
          ? startPart === 2
            ? `Good ${timeOfDay}${userName ? ", " + userName : ""}. I'm ${partnerName}. We'll go straight to Part 2. You have one minute to prepare, then speak for one to two minutes. Your topic is: describe a person who has inspired you.`
            : startPart === 3
            ? `Good ${timeOfDay}${userName ? ", " + userName : ""}. I'm ${partnerName}. Let's go straight to Part 3. Why do you think some people are more influential in society than others?`
            : `Good ${timeOfDay}${userName ? ", " + userName : ""}. I'm ${partnerName}, your examiner today. Let's begin. Can you tell me your full name, please?`
          : `Hey${userName ? " " + userName : ""}, it's ${partnerName}. Ready to work? Tell me — what did you actually do today besides scrolling Instagram?`;
    }
    if (startPart === 2 && !cueCard) {
      cueCard = {
        topic: "Describe a person who has inspired you.",
        bullets: ["who this person is", "how you know them", "what they have done", "and explain why they inspire you"],
      };
    }

    // Fire-and-forget — the client must not wait on the DB write.
    void saveSpeakingMemory(supabase, user.id, {
      recent_greetings: [...memory.recent_greetings, text].slice(-8),
    }).catch(() => {});

    return NextResponse.json({ text, emotion, cue_card: cueCard });
  } catch (e) {
    console.error("greeting error:", e);
    return NextResponse.json({ error: "Greeting failed" }, { status: 500 });
  }
}
