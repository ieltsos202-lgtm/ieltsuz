import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { generateJSON } from "@/lib/gemini";

// Per-user and auth-header dependent: never prerender.
export const dynamic = "force-dynamic";

type Skill = "listening" | "reading" | "writing" | "speaking";
const SKILLS: Skill[] = ["listening", "reading", "writing", "speaking"];
const TABLE: Record<Skill, string> = {
  listening: "listening_results",
  reading: "reading_results",
  writing: "writing_results",
  speaking: "speaking_results",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET: return today's proactive AI coach message, generating + persisting it
// the first time it's requested each day (idempotent per user per day).
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const uid = user.id;
    const date = today();

    // Already generated today? Return it as-is (no repeat Gemini calls).
    try {
      const { data: existing } = await supabase
        .from("coach_daily_messages")
        .select("message, date")
        .eq("user_id", uid)
        .eq("date", date)
        .maybeSingle();
      if (existing?.message) {
        return NextResponse.json({ message: existing.message, date, is_new: false });
      }
    } catch {
      /* table missing — fall through and still generate a one-off message */
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, target_band, exam_date")
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

    const yesterdayCutoff = Date.now() - 2 * 86400000;
    const recentLines = SKILLS.map((s, i) => {
      const r: any = latest[i].data;
      if (!r) return `- ${s}: no attempts yet`;
      const isRecent = new Date(r.created_at).getTime() >= yesterdayCutoff;
      const fb = r.feedback ? ` — note: ${String(r.feedback).slice(0, 160)}` : "";
      return `- ${s}: latest band ${r.band_score ?? "?"}${isRecent ? " (practiced in the last 2 days)" : " (not practiced recently)"}${fb}`;
    }).join("\n");

    const daysToExam = profile?.exam_date
      ? Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000)
      : null;

    const name = profile?.full_name?.split(" ")[0] || "there";
    const hasAnyData = latest.some((r) => r.data);

    const prompt = `You are a personal IELTS AI coach writing a short DAILY check-in message to bring the student back to practice today. Be warm, specific, and motivating — never generic.

STUDENT: ${name}
Target band: ${profile?.target_band ?? 7}
${daysToExam != null ? `Days to exam: ${daysToExam}` : "No exam date set"}

RECENT RESULTS:
${recentLines}

RULES:
- 1-2 short sentences only (this appears as a notification/dashboard card).
- If they practiced recently, congratulate them on something specific and suggest the next concrete step.
- If a skill has not been practiced recently or ever, gently nudge them toward it by name.
- If there is no data at all, give a friendly first-day welcome nudging them to try their first test.
- Do not use generic filler like "keep up the good work" without specifics.
- Write in clear, friendly English.

Return ONLY this JSON: {"message": "the daily message", "focus_skill": "listening|reading|writing|speaking|null"}`;

    let message = hasAnyData
      ? `Hi ${name}! Ready for today's practice? Pick a skill and keep your streak going.`
      : `Welcome, ${name}! Take your first practice test today to start tracking your progress toward band ${profile?.target_band ?? 7}.`;

    try {
      const ai = await generateJSON(prompt);
      if (typeof ai?.message === "string" && ai.message.trim()) {
        message = ai.message.trim();
      }
    } catch {
      /* fall back to the default message above */
    }

    try {
      await supabase
        .from("coach_daily_messages")
        .upsert({ user_id: uid, date, message, created_at: new Date().toISOString() }, { onConflict: "user_id,date" });
    } catch {
      /* table missing — message still returned, just not persisted */
    }

    try {
      await supabase.from("notifications").insert({
        user_id: uid,
        title: "Your AI Coach",
        message,
        type: "daily_coach",
        read: false,
      });
    } catch {
      /* notifications table missing or insert failed — non-critical */
    }

    return NextResponse.json({ message, date, is_new: true });
  } catch (error: any) {
    console.error("Daily coach message error:", error);
    return NextResponse.json({ error: "Failed to generate daily message" }, { status: 500 });
  }
}
