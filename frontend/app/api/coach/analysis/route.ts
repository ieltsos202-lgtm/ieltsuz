import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { generateJSON } from "@/lib/gemini";

type Skill = "listening" | "reading" | "writing" | "speaking";
const SKILLS: Skill[] = ["listening", "reading", "writing", "speaking"];
const TABLE: Record<Skill, string> = {
  listening: "listening_results",
  reading: "reading_results",
  writing: "writing_results",
  speaking: "speaking_results",
};

const SELECT: Record<Skill, string> = {
  listening: "band_score, correct_count, total_questions, weak_areas, feedback, created_at, test_source",
  reading: "band_score, correct_count, total_questions, feedback, created_at, test_source",
  writing: "band_score, task_achievement, coherence_cohesion, lexical_resource, grammatical_range, strengths, improvements, feedback, created_at, test_source",
  speaking: "band_score, fluency_coherence, lexical_resource, grammatical_range, pronunciation, grammar_errors, vocabulary_suggestions, feedback, created_at",
};

function clip(v: any, n = 220): any {
  if (typeof v === "string") return v.length > n ? v.slice(0, n) + "…" : v;
  if (Array.isArray(v)) return v.slice(0, 4).map((x) => clip(x, 110));
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    const uid = user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, target_band, exam_date, current_level, listening_band, reading_band, writing_band, speaking_band")
      .eq("id", uid)
      .single();

    const targetBand = Number(profile?.target_band) || 7;

    const [skillResults, mockRes] = await Promise.all([
      Promise.all(
        SKILLS.map((s) =>
          supabase
            .from(TABLE[s])
            .select(SELECT[s], { count: "exact" })
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(6)
        )
      ),
      supabase
        .from("mock_test_results")
        .select("overall_band, listening_band, reading_band, writing_band, speaking_band, overall_feedback, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const perSkill: Record<string, any> = {};
    const sigParts: string[] = [`t:${targetBand}`, `e:${profile?.exam_date || ""}`];
    let totalAttempts = 0;

    SKILLS.forEach((s, i) => {
      const rows = (skillResults[i].data as any[]) || [];
      const count = skillResults[i].count ?? rows.length;
      totalAttempts += count;
      const latest = rows[0];
      sigParts.push(`${s}:${count}:${latest?.created_at || ""}`);
      perSkill[s] = {
        attempts: count,
        latest_band: latest?.band_score ?? null,
        recent_bands: rows.map((r) => r.band_score).filter((b) => b != null),
        recent: rows.slice(0, 4).map((r) => {
          const o: any = { band: r.band_score };
          if (r.correct_count != null) o.score = `${r.correct_count}/${r.total_questions ?? 40}`;
          if (r.weak_areas) o.weak_areas = clip(r.weak_areas);
          if (r.task_achievement != null) o.criteria = { TA: r.task_achievement, CC: r.coherence_cohesion, LR: r.lexical_resource, GRA: r.grammatical_range };
          if (r.fluency_coherence != null) o.criteria = { FC: r.fluency_coherence, LR: r.lexical_resource, GRA: r.grammatical_range, Pron: r.pronunciation };
          if (r.improvements) o.improvements = clip(r.improvements);
          if (r.grammar_errors) o.grammar_errors = clip(r.grammar_errors);
          if (r.feedback) o.feedback = clip(r.feedback);
          return o;
        }),
      };
    });

    const mocks = (mockRes.data as any[]) || [];
    const signature = sigParts.join("|") + `|m:${mocks.length}:${mocks[0]?.created_at || ""}`;
    const hasData = totalAttempts > 0 || mocks.length > 0;

    if (!refresh) {
      try {
        const { data: cached } = await supabase
          .from("coach_analyses")
          .select("analysis, signature")
          .eq("user_id", uid)
          .maybeSingle();
        if (cached && cached.signature === signature && cached.analysis) {
          return NextResponse.json({ analysis: cached.analysis, cached: true, has_data: hasData });
        }
      } catch {
        /* table missing — generate */
      }
    }

    const daysToExam = profile?.exam_date
      ? Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000)
      : null;

    const studentData = {
      name: profile?.full_name || "Student",
      target_band: targetBand,
      exam_date: profile?.exam_date || null,
      days_to_exam: daysToExam,
      current_level: profile?.current_level || null,
      self_assessed: {
        listening: profile?.listening_band ?? null,
        reading: profile?.reading_band ?? null,
        writing: profile?.writing_band ?? null,
        speaking: profile?.speaking_band ?? null,
      },
      skills: perSkill,
      mock_tests: mocks.map((m) => ({ overall: m.overall_band, L: m.listening_band, R: m.reading_band, W: m.writing_band, S: m.speaking_band, date: String(m.created_at).slice(0, 10) })),
    };

    const prompt = `You are a personal IELTS AI coach (AI Teacher). Below is the student's full results, weak areas, and target. Analyze everything and give clear, practical, motivating guidance to reach their target band.

RULES:
- Write all text fields in clear English (friendly, professional tutor tone).
- Be specific: say exactly what to do, not vague advice like "practice more".
- If no data for a skill, use status "no_data" and suggest trying that skill.
- Bands are 0-9 in 0.5 steps. Target is ${targetBand}. gap = target - current per skill.

STUDENT DATA (JSON):
${JSON.stringify(studentData)}

Return ONLY this JSON format:
{
  "headline": "1-sentence overall status",
  "motivation": "2-3 sentences of personal motivation using their name",
  "current_overall": number_or_null,
  "overall_gap": number,
  "readiness_percent": number,
  "priorities": ["most important skill name"],
  "skills": [
    {"skill":"listening","current":number_or_null,"target":${targetBand},"gap":number,"status":"on_track|close|needs_work|no_data","summary":"1-2 sentences","weaknesses":["..."],"strengths":["..."],"actions":["specific action","..."]}
  ],
  "weekly_plan": [{"focus":"Day — topic","tasks":["task","..."]}],
  "strategy": ["3-5 strategic tips"]
}
Include all 4 skills in "skills". "weekly_plan" should cover 5-7 days.`;

    const ai = await generateJSON(prompt);

    const analysis = {
      generated_at: new Date().toISOString(),
      headline: ai.headline || "",
      motivation: ai.motivation || "",
      current_overall: ai.current_overall ?? null,
      target_band: targetBand,
      overall_gap: ai.overall_gap ?? 0,
      readiness_percent: ai.readiness_percent ?? 0,
      exam_date: profile?.exam_date || null,
      days_to_exam: daysToExam,
      priorities: ai.priorities || [],
      skills: ai.skills || [],
      weekly_plan: ai.weekly_plan || [],
      strategy: ai.strategy || [],
    };

    try {
      await supabase
        .from("coach_analyses")
        .upsert({ user_id: uid, signature, analysis, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    } catch {
      /* cache table missing — ignore */
    }

    return NextResponse.json({ analysis, cached: false, has_data: hasData });
  } catch (error: any) {
    console.error("Coach analysis error:", error);
    return NextResponse.json({ error: "Failed to generate analysis" }, { status: 500 });
  }
}
