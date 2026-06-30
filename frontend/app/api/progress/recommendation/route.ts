import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import { getAuth } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ recommendation: "Start with a mock test to assess your current level." });
    }

    const uid = user.id;
    const [speaking, writing, listening, reading] = await Promise.all([
      supabase.from("speaking_results").select("band_score, feedback").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("writing_results").select("band_score, feedback").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("listening_results").select("band_score, feedback").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("reading_results").select("band_score, feedback").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).single(),
    ]);

    const prompt = `You are an expert IELTS study coach. Based on this student's recent results, give a concise, actionable study recommendation in 2-3 sentences.

Latest scores:
- Speaking: ${speaking.data?.band_score ?? "N/A"}
- Writing: ${writing.data?.band_score ?? "N/A"}
- Listening: ${listening.data?.band_score ?? "N/A"}
- Reading: ${reading.data?.band_score ?? "N/A"}

Return ONLY a JSON object: {"recommendation": "your advice here"}`;

    const result = await generateJSON(prompt);
    return NextResponse.json({ recommendation: result.recommendation || "Keep practicing daily across all four skills." });
  } catch {
    return NextResponse.json({ recommendation: "Keep practicing daily across all four skills." });
  }
}
