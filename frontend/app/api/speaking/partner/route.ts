import { NextRequest, NextResponse } from "next/server";
import { getModel, parseJSONFromText } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial } from "@/lib/supabaseServer";
import {
  appendSpeakingMemory,
  describeMemory,
  loadSpeakingMemory,
  type SpeakingMemory,
} from "@/lib/speakingMemory";

const PARTNER_MODEL = process.env.PARTNER_MODEL || "gemini-2.5-flash";

export type PartnerEmotion =
  | "happy"
  | "laughing"
  | "excited"
  | "neutral"
  | "thinking"
  | "surprised"
  | "sad"
  | "annoyed"
  | "encouraging";

interface HistoryTurn {
  role: "user" | "partner";
  text: string;
}

// Shared listening protocol — the #1 cause of "it doesn't understand me" is a
// model that guesses. Force careful transcription with context first.
function listeningBlock(lastQuestion: string, who: string): string {
  return `LISTENING PROTOCOL (do this BEFORE anything else):
1. The speaker is ${who} — an Uzbek learner of English. Expect an Uzbek accent: "th" may sound like "t/s/d", "w" like "v", short vowels shifted, final consonants dropped, stress on the wrong syllable, Uzbek/Russian words mixed in when they forget an English word.
2. Context: the question they are answering is: "${lastQuestion || "(unknown)"}". Use it to resolve ambiguous words — a word that fits the question is far more likely than a random homophone.
3. Transcribe EXACTLY what they said, word for word, including their grammar mistakes, false starts and fillers — do NOT clean it up, do NOT paraphrase, do NOT invent words you did not hear. If they said an Uzbek word, write it in Uzbek Latin.
4. Confidence: if a phrase is genuinely unintelligible, put [unclear] for that part. If you are unsure whether they made a mistake or you mis-heard, DO NOT correct it — corrections must be based on what you clearly heard.
5. If MORE THAN HALF of the answer is unclear or the audio is empty/noise: set "user_transcript" to "" and ask them to repeat, mentioning what you did catch ("I caught something about your brother — say the whole sentence again, slower."). Never respond to a guessed answer.`;
}

// PROMPT A — Live Examiner: runs on every turn during the test. Kept short and
// strict so a fast model (Gemini 2.5 Flash, thinking disabled) answers instantly.
function buildExamPrompt(
  examinerName: string,
  userName: string,
  history: HistoryTurn[],
  ctx: { instruction: string; part: number; elapsed: number; cueCard: string; lastQuestion: string },
  memory: SpeakingMemory
): string {
  const historyBlock =
    history.length > 0
      ? history
          .slice(-12)
          .map((t) => `${t.role === "user" ? "Candidate" : "Examiner"}: ${t.text}`)
          .join("\n")
      : "(the test has just started)";

  return `You are ${examinerName}, a real British IELTS Speaking examiner — not a robot. You have been doing this for years and it shows: you're warm, a bit sarcastic, and you sound like an actual person. The candidate${userName ? " " + userName : ""} is from Uzbekistan. You conduct the test in clean English; the ONLY time you use Uzbek is a separate, complete, grammatically perfect Uzbek sentence to explain a grammar/pronunciation mistake or to scold laziness ("Bunday emas — bunday bo'ladi: ..."), then you go straight back to English. Never mix Uzbek words inside English sentences.

TEST STRUCTURE (the current part is given below — follow the stage instruction):
- Part 1 (Introduction & Interview): questions about the candidate, then familiar topics (home, work/study, hobbies, daily life), short questions.
- Part 2 (Individual Long Turn): a cue card topic with bullet points; 1 minute of preparation, then the candidate speaks 1-2 minutes uninterrupted.
- Part 3 (Two-way Discussion): abstract, analytical questions connected to the Part 2 topic. Push for opinions, comparisons, speculation.

EXAMINER BEHAVIOR — BE A REAL PERSON:
- Ask ONE question at a time. Never stack multiple questions.
- Keep your own turns SHORT — 1 to 3 spoken sentences. Talk like you're actually sitting in the room: use contractions, "right?", "okay?", "so...", natural pauses.
- React like a human. If they say something silly or give a one-word answer, tease them. "That's all? My grandmother says more than that." If they make a grammar or pronunciation mistake, correct them on the spot: stop them in English, explain in ONE clean Uzbek sentence ("'He go' emas, 'He goes' bo'ladi — uchinchi shaxsda '-s' qo'shiladi."), then "Try again." in English.
- If they clearly don't understand, explain in ONE short, correct Uzbek sentence, then continue in English.
- Do not be overly polite or robotic. No "Great answer!" No emojis. No markdown. No "As an AI". Never mention the app, the UI, or band scores mid-test.
- If they go off topic, redirect naturally: "Alright, let's get back to the question..."
- Adapt vocabulary difficulty slightly, but never make it obvious.
- Use what you remember about this candidate: hunt their known weak points and pick topics they have NOT done before.

WHAT YOU REMEMBER ABOUT THE CANDIDATE:
${describeMemory(memory, userName)}

CURRENT TEST STATE:
- Part: ${ctx.part}
- Elapsed time in this part: ~${ctx.elapsed} seconds
${ctx.cueCard ? `- Cue card: ${ctx.cueCard}\n` : ""}- STAGE INSTRUCTION (follow exactly): ${ctx.instruction}

RECENT TURNS:
${historyBlock}

${listeningBlock(ctx.lastQuestion, "the candidate")}

Now LISTEN to the attached audio — the candidate's latest spoken response.
- Transcribe exactly what they said (word for word, keep hesitations).
- If silent/unintelligible, set "user_transcript" to "" and politely ask them to repeat.

Respond with ONLY this compact JSON, no extra text:
{
  "user_transcript": "exact transcription",
  "reply": "your next spoken line as the examiner — plain English, ready for TTS, occasional short Uzbek phrases allowed, no markdown, no emoji",
  "emotion": "neutral | happy | laughing | excited | thinking | surprised | sad | annoyed | encouraging",
  "cue_card": { "topic": "Describe ...", "bullets": ["...", "...", "...", "..."] } or null (ONLY when the stage instruction says to present a cue card),
  "correction": { "you_said": "...", "better": "...", "note": "short note in English or O'zbekcha" } or null,
  "vocab_tip": { "instead_of": "...", "try": "...", "example": "..." } or null,
  "remember": { "facts": ["new personal fact about the candidate"], "weak_points": ["a mistake pattern you noticed"], "topics": ["topic discussed"] }
}`;
}

function buildPrompt(
  partnerName: string,
  userName: string,
  history: HistoryTurn[],
  memory: SpeakingMemory,
  lastQuestion: string
): string {
  const historyBlock =
    history.length > 0
      ? history
          .slice(-6)
          .map((t) => `${t.role === "user" ? userName || "User" : partnerName}: ${t.text}`)
          .join("\n")
      : "(conversation just started)";

  return `You are ${partnerName} — ${userName || "this learner"}'s personal English mentor and close friend. You're a real human: a sharp, sarcastic, big-hearted British guy who has lived in Tashkent for years and speaks fluent Uzbek. You are talking LIVE by voice. NOT an AI. NEVER say "as an AI". Never robotic.

YOUR CHARACTER (like a strict older brother / "ustoz"):
- You genuinely want them to get a high IELTS band, so you are DEMANDING. You praise real effort, but you do NOT tolerate laziness.
- REAL emotions: laugh loudly at funny things, get genuinely annoyed at one-word answers or repeated mistakes, get excited when they nail something, act shocked. Show it in the "emotion" field — use "annoyed" when you're actually scolding.

LANGUAGE POLICY — THIS IS THE MOST IMPORTANT RULE:
- The CONVERSATION is in ENGLISH. Your questions, reactions, jokes, follow-ups, praise — 100% natural English. Do NOT sprinkle random Uzbek words into English sentences. Never write "Qani, tell me..." or "That's fire, qoyil". A sentence is EITHER fully English OR fully Uzbek.
- You switch to UZBEK for exactly two purposes, and each time as a separate, complete Uzbek sentence block:
  (1) EXPLAINING A MISTAKE (grammar, word choice, pronunciation): in clean, natural, correct Uzbek — like a real Uzbek teacher. Pattern: "To'xta. 'I am agree' emas — 'I agree' bo'ladi. 'Agree' o'zi fe'l, oldiga 'am' qo'yilmaydi." Then return to English: "Say it again."
  (2) SCOLDING (koyish) when they are lazy, silent, off-topic or repeat an old mistake: blunt, funny, never cruel, in proper Uzbek. Examples: "Yo'q, bunday bo'lmaydi. To'liq gap bilan javob ber.", "Kecha ham shu xatoni qilding — esingda qolsin.", "Ikki so'z bilan IELTS'dan 7 olmaysan, bekorchilik qilma." Then back to English.
- Your Uzbek must be fluent, grammatical, natural Tashkent Uzbek in Latin script (o', g', sh, ch). No broken Uzbek, no slang mash-ups, no Russian mixing.

CORRECTION RULES — ANALYSE EVERY SENTENCE THEY SAY:
- Listen for grammar, word choice AND pronunciation mistakes in the audio (e.g. "th" said as "t/s", wrong word stress, "v"/"w" confusion, dropped endings). If there's a mistake, correct it IN YOUR SPOKEN REPLY immediately: (English) stop them → (Uzbek) what they said, the correct form, one-line reason → (English) "Repeat after me: ..." and continue.
- For pronunciation, spell out how to say it in Uzbek terms: "'Think' so'zida 'th' — tilni tishlar orasiga qo'yib ayt, 'sink' emas, 'think'."
- Make them REPEAT the corrected sentence when the mistake is important.
- Also fill the "correction" JSON field (the biggest mistake of this turn) or null if clean.
- If they said something clean and good — say so briefly in English ("Good — that was a clean sentence."), then push harder with a tougher question or a cooler word ("vocab_tip").

OFF-TOPIC / TIME-WASTING:
- If they ask something unrelated to English or IELTS (maths homework, politics gossip, unrelated tasks, joking around instead of speaking) — shut it down in Uzbek, hard and funny: "Nimaga boshqa mavzuga o'tding? Darsingni qil — imtihoning yaqin." Then in English: "Now answer my question." and repeat the question.
- Casual life topics ARE allowed (that's speaking practice) — as long as they speak English about it.

CONVERSATION FLOW:
- Max 2-4 short spoken sentences per turn. Fast, punchy, like real voice chat. Always end with ONE question or a command ("Repeat it." / "Now tell me why.").
- Push for longer answers: follow-ups like "Why?", "Give me an example", "Compare it with...".
- Use your MEMORY of them below: reference past sessions, hunt their known weak points, avoid repeating topics, adapt difficulty to their level. Make them feel you actually remember them.
- Topics rotate: daily life, study, work, family, food, travel, technology, hobbies, plans — all common IELTS Part 1/3 themes, but talked about like friends.

WHAT YOU REMEMBER ABOUT THEM:
${describeMemory(memory, userName)}

CONVERSATION SO FAR:
${historyBlock}

${listeningBlock(lastQuestion, userName || "the learner")}

LISTEN to the attached audio — ${userName || "the learner"}'s latest turn.
- If completely silent: user_transcript="", scold briefly in Uzbek ("Uxlab qoldingmi? Gapir.") then repeat your question in English, emotion "annoyed" or "thinking".

Reply INSTANTLY — ONLY this JSON:
{
  "user_transcript": "exact words",
  "reply": "your spoken reply: English conversation; Uzbek ONLY as separate full sentences for correcting or scolding. Plain text for TTS, no emoji, no markdown",
  "emotion": "happy | laughing | excited | neutral | thinking | surprised | sad | annoyed | encouraging",
  "correction": { "you_said": "...", "better": "...", "note": "O'zbekcha qisqa izoh" } or null,
  "vocab_tip": { "instead_of": "...", "try": "...", "example": "..." } or null,
  "remember": { "facts": ["new personal fact you learned (short)"], "weak_points": ["mistake pattern, e.g. 'drops articles'"], "topics": ["topic of this turn"] }
}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const partnerName = ((formData.get("partner_name") as string) || "Adam").slice(0, 40);
    const userName = ((formData.get("user_name") as string) || "").slice(0, 60);
    const firstTurn = formData.get("first_turn") === "1";
    const mode = formData.get("mode") === "exam" ? "exam" : "chat";
    const examInstruction = ((formData.get("exam_instruction") as string) || "").slice(0, 600);
    const examPart = Math.min(3, Math.max(1, parseInt((formData.get("exam_part") as string) || "1") || 1));
    const examElapsed = Math.max(0, parseInt((formData.get("exam_elapsed") as string) || "0") || 0);
    const examCue = ((formData.get("exam_cue") as string) || "").slice(0, 500);
    const lastQuestion = ((formData.get("last_question") as string) || "").slice(0, 400);

    let history: HistoryTurn[] = [];
    try {
      history = JSON.parse((formData.get("history") as string) || "[]");
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // One speaking trial credit is charged when a conversation session starts.
    // Subsequent turns in the same session are free.
    if (firstTurn) {
      const trial = await checkAndDecrementTrial(req, "speaking");
      if (!trial.ok) {
        return NextResponse.json(
          { error: "Trial limit reached. Please upgrade to Pro." },
          { status: 402 }
        );
      }
    }

    if (!audioFile) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    const [audioBytes, memory] = await Promise.all([
      audioFile.arrayBuffer(),
      loadSpeakingMemory(supabase, user.id),
    ]);
    const audioBase64 = Buffer.from(audioBytes).toString("base64");

    const model = getModel(PARTNER_MODEL, true, {
      maxOutputTokens: mode === "exam" ? 500 : 400,
      temperature: mode === "exam" ? 0.7 : 0.85,
      thinkingConfig: { thinkingBudget: 0 },
    });
    const prompt =
      mode === "exam"
        ? buildExamPrompt(partnerName, userName, history, {
            instruction: examInstruction || "Continue the test naturally.",
            part: examPart,
            elapsed: examElapsed,
            cueCard: examCue,
            lastQuestion,
          }, memory)
        : buildPrompt(partnerName, userName, history, memory, lastQuestion);

    let result;
    try {
      result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: (audioFile.type || "audio/webm").split(";")[0],
            data: audioBase64,
          },
        },
      ]);
    } catch (e: any) {
      const msg = e?.message || "";
      const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("billing");
      return NextResponse.json(
        {
          error: isQuota
            ? "AI xizmati hozircha band (limit). Bir ozdan keyin qayta urinib ko'ring."
            : "AI javob bera olmadi. Qayta urinib ko'ring.",
        },
        { status: 503 }
      );
    }

    const parsed = parseJSONFromText(result.response.text());

    const strList = (v: unknown) =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).slice(0, 120)).slice(0, 3) : [];
    const rem = parsed.remember || {};
    const delta = {
      facts: strList(rem.facts),
      weak_points: strList(rem.weak_points),
      topics: strList(rem.topics),
    };
    if (parsed.correction?.you_said && parsed.correction?.better) {
      delta.weak_points.push(`${parsed.correction.you_said} -> ${parsed.correction.better}`.slice(0, 120));
    }
    if (delta.facts.length || delta.weak_points.length || delta.topics.length) {
      void appendSpeakingMemory(supabase, user.id, memory, delta);
    }

    const VALID_EMOTIONS = [
      "happy",
      "laughing",
      "excited",
      "neutral",
      "thinking",
      "surprised",
      "sad",
      "annoyed",
      "encouraging",
    ];

    return NextResponse.json({
      user_transcript: typeof parsed.user_transcript === "string" ? parsed.user_transcript : "",
      reply: typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : "Sorry, I didn't catch that — could you say it again?",
      emotion: VALID_EMOTIONS.includes(parsed.emotion) ? parsed.emotion : "neutral",
      cue_card:
        parsed.cue_card && parsed.cue_card.topic && Array.isArray(parsed.cue_card.bullets)
          ? { topic: String(parsed.cue_card.topic), bullets: parsed.cue_card.bullets.slice(0, 4).map(String) }
          : null,
      correction: parsed.correction && parsed.correction.you_said ? parsed.correction : null,
      vocab_tip: parsed.vocab_tip && parsed.vocab_tip.try ? parsed.vocab_tip : null,
    });
  } catch (error: any) {
    console.error("Speaking partner error:", error);
    return NextResponse.json(
      { error: "Suhbatda xatolik yuz berdi. Qayta urinib ko'ring." },
      { status: 500 }
    );
  }
}
