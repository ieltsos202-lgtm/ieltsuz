import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import { buildStudyPlan } from "@/lib/studyPlan";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { current_level, target_band } = await req.json();
  const fallback = buildStudyPlan(current_level, target_band);

  // Unauthenticated AI call — cap it; the deterministic plan above is the
  // graceful answer when the limit is hit.
  if (rateLimit(`study-calc:${clientIp(req)}`, 20, 10 * 60_000)) {
    return NextResponse.json(fallback);
  }

  try {
    const prompt = `An IELTS student is at an estimated band ${fallback.current_band_estimate} and targeting band ${fallback.target_band}.
Write a short, motivating 2-sentence study message and pick the 2-4 IELTS skills they should focus on most.
Return ONLY valid JSON:
{"message": "your motivating message", "focus_skills": ["Writing", "Speaking"]}`;

    const ai = await generateJSON(prompt);
    return NextResponse.json({
      ...fallback,
      message: typeof ai?.message === "string" && ai.message ? ai.message : fallback.message,
      focus_skills:
        Array.isArray(ai?.focus_skills) && ai.focus_skills.length
          ? ai.focus_skills
          : fallback.focus_skills,
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
