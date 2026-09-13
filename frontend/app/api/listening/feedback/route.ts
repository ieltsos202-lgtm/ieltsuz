import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial } from "@/lib/supabaseServer";

function listeningBand(correct: number): number {
  if (correct >= 39) return 9.0;
  if (correct >= 37) return 8.5;
  if (correct >= 35) return 8.0;
  if (correct >= 32) return 7.5;
  if (correct >= 30) return 7.0;
  if (correct >= 26) return 6.5;
  if (correct >= 23) return 6.0;
  if (correct >= 18) return 5.5;
  if (correct >= 16) return 5.0;
  if (correct >= 13) return 4.5;
  if (correct >= 10) return 4.0;
  if (correct >= 8) return 3.5;
  if (correct >= 6) return 3.0;
  if (correct >= 4) return 2.5;
  if (correct >= 2) return 2.0;
  if (correct >= 1) return 1.5;
  return 0.0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { test_id, test_title, correct_count, total, wrong_answers, time_spent_sec, unanswered } = body;

    const band = listeningBand(correct_count);
    const wrong = wrong_answers || [];
    const timeSec = Number(time_spent_sec) || 0;
    const skipped: number[] = Array.isArray(unanswered) ? unanswered : [];

    const hasWrong = Array.isArray(wrong) && wrong.length > 0;

    const prompt = `You are a senior, certified IELTS Listening examiner and tutor.

Test: ${test_title || "Listening Test"}
Score: ${correct_count}/${total || 40} correct  →  Band ${band}
${timeSec ? `Time spent: ${Math.floor(timeSec / 60)} min ${timeSec % 60} sec (standard test time: 30 min + 10 min transfer).` : ""}
${skipped.length ? `Questions left UNANSWERED: ${skipped.join(", ")} — comment on time management / avoidance patterns.` : ""}

${
  hasWrong
    ? `The candidate's WRONG answers (with the correct answers) are listed below. For EACH one, analyse precisely why a learner would have made that specific mistake (e.g. spelling, plural/singular, distractor in the audio, paraphrase they missed, number/date format) and give a concrete, actionable tip to avoid it next time.
WRONG ANSWERS:
${JSON.stringify(wrong, null, 2)}`
    : `No per-question data was captured. Base your analysis on the score (${correct_count}/40) and the most common IELTS Listening failure patterns for this band, and be honest that this is general guidance.`
}

WRITE BILINGUALLY: every explanation/tip/feedback first in clear English, then the same point in natural Uzbek after " | O'zbekcha: ".

Return ONLY valid JSON with EXACTLY these fields:
{
  "correct_count": ${correct_count},
  "total_questions": ${total || 40},
  "band_score": ${band},
  "wrong_analysis": [
    {
      "question_number": 1,
      "user_answer": "what they wrote",
      "correct_answer": "the correct answer",
      "why_wrong": "Precise reason for THIS mistake | O'zbekcha: ...",
      "tip": "How to get it right next time | O'zbekcha: ..."
    }
  ],
  "weak_areas": ["Specific weak skill | O'zbekcha: ..."],
  "feedback": "Honest, encouraging summary: level now, biggest fix, how to improve | O'zbekcha: ...",
  "improvement_tips": ["Actionable practice tip | O'zbekcha: ..."],
  "estimated_weak_question_types": ["gap filling", "multiple choice", "matching", "map labelling", "form completion"]
}
${hasWrong ? "Include one wrong_analysis entry for EVERY wrong answer provided." : "If no wrong answers were provided, return an empty wrong_analysis array and focus on weak_areas and improvement_tips."}`;

    const feedback = await generateJSON(prompt);
    feedback.correct_count = correct_count;
    feedback.total_questions = total || 40;
    feedback.band_score = band;

    const trial = await checkAndDecrementTrial(req, "listening");
    if (!trial.ok) {
      return NextResponse.json({ error: "Trial limit reached. Please upgrade to Pro." }, { status: 402 });
    }

    const { supabase, user } = await getAuth(req);

    if (user) {
      await supabase.from("listening_results").insert({
        user_id: user.id,
        test_source: test_id,
        total_questions: feedback.total_questions,
        correct_count: feedback.correct_count,
        band_score: feedback.band_score,
        wrong_analysis: feedback.wrong_analysis,
        weak_areas: feedback.weak_areas,
        feedback: feedback.feedback,
        improvement_tips: feedback.improvement_tips,
        time_taken_seconds: timeSec,
      });
    }

    return NextResponse.json(feedback);
  } catch (error) {
    console.error("Listening feedback error:", error);
    return NextResponse.json({ error: "Feedback generation failed" }, { status: 500 });
  }
}
