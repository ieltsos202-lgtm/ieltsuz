import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { generateText } from "@/lib/gemini";
import { rateLimit } from "@/lib/rateLimit";

type Skill = "listening" | "reading" | "writing" | "speaking";
const SKILLS: Skill[] = ["listening", "reading", "writing", "speaking"];
const TABLE: Record<Skill, string> = {
  listening: "listening_results",
  reading: "reading_results",
  writing: "writing_results",
  speaking: "speaking_results",
};

// GET: load saved chat history
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
      const { data } = await supabase
        .from("coach_messages")
        .select("role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(100);
      return NextResponse.json({ messages: data || [] });
    } catch {
      return NextResponse.json({ messages: [] });
    }
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

async function buildContext(supabase: any, uid: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, target_band, exam_date, current_level")
    .eq("id", uid)
    .single();

  const latest = await Promise.all(
    SKILLS.map((s) =>
      supabase
        .from(TABLE[s])
        .select("band_score, feedback, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    )
  );

  const lines = SKILLS.map((s, i) => {
    const r = latest[i].data;
    if (!r) return `- ${s}: no tests yet`;
    const fb = r.feedback ? ` (note: ${String(r.feedback).slice(0, 140)})` : "";
    return `- ${s}: latest band ${r.band_score ?? "?"}${fb}`;
  }).join("\n");

  const daysToExam = profile?.exam_date
    ? Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000)
    : null;

  return `STUDENT PROFILE:
- Name: ${profile?.full_name || "Student"}
- Target band: ${profile?.target_band ?? 7}
- Level: ${profile?.current_level || "unknown"}
- Days to exam: ${daysToExam != null ? daysToExam + " days" : "not set"}
Latest results:
${lines}`;
}

// POST: send a message, get the AI teacher's reply
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const message = (body.message || "").toString().trim();
    if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: "Message too long" }, { status: 400 });

    // Each message is a paid AI call — cap per user so it cannot be scripted.
    if (rateLimit(`coach-chat:${user.id}`, 30, 10 * 60_000)) {
      return NextResponse.json(
        { error: "Juda ko'p xabar. Biroz kutib qayta yozing." },
        { status: 429 }
      );
    }

    const uid = user.id;

    // Recent history for continuity (last 12 messages)
    let history: { role: string; content: string }[] = [];
    try {
      const { data } = await supabase
        .from("coach_messages")
        .select("role, content")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(12);
      history = (data || []).reverse();
    } catch {
      /* table missing */
    }

    const context = await buildContext(supabase, uid);

    const historyText = history
      .map((m) => `${m.role === "user" ? "Student" : "Coach"}: ${m.content}`)
      .join("\n");

    const prompt = `You are a personal IELTS AI coach (AI Teacher). Answer the student's questions clearly, helpfully, and encouragingly — using their results and target band.

RULES:
- Reply in clear English (friendly, professional tutor tone). IELTS terms and short examples are welcome.
- Be specific and practical. Give examples, rules, or exercises when useful.
- Keep answers concise (usually 1-4 paragraphs). No filler.
- Answer the question directly. If off-topic, politely redirect to IELTS preparation.

${context}
${historyText ? `\nPREVIOUS CHAT:\n${historyText}\n` : ""}
Student's new question: ${message}

Reply as the coach:`;

    let reply = "";
    try {
      reply = await generateText(prompt, { primary: "gemini-3.6-flash", fallback: "gemini-3.5-flash", maxRetries: 3 });
    } catch (e: any) {
      console.error("Coach chat Gemini error:", e?.message || e);
      const msg = e?.message || "";
      const isQuota = msg.includes("quota") || msg.includes("billing") || msg.includes("429");
      const userMsg = isQuota
        ? "AI xizmati hozircha mavjud emas (limit tugagan). Iltimos, administrator bilan bog'laning yoki keyinroq urinib ko'ring."
        : "AI javob bera olmadi. Iltimos, keyinroq qayta urinib ko'ring.";
      return NextResponse.json({ error: userMsg }, { status: 500 });
    }

    // Persist both messages (best-effort)
    try {
      await supabase.from("coach_messages").insert([
        { user_id: uid, role: "user", content: message },
        { user_id: uid, role: "assistant", content: reply },
      ]);
    } catch {
      /* table missing — skip persistence */
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("Coach chat error:", error);
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 });
  }
}

// DELETE: clear chat history
export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      await supabase.from("coach_messages").delete().eq("user_id", user.id);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
