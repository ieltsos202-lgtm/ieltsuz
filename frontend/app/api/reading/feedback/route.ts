import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial } from "@/lib/supabaseServer";

function readingBand(correct: number): number {
  if (correct >= 39) return 9.0;
  if (correct >= 37) return 8.5;
  if (correct >= 35) return 8.0;
  if (correct >= 33) return 7.5;
  if (correct >= 30) return 7.0;
  if (correct >= 27) return 6.5;
  if (correct >= 23) return 6.0;
  if (correct >= 19) return 5.5;
  if (correct >= 15) return 5.0;
  if (correct >= 13) return 4.5;
  if (correct >= 10) return 4.0;
  return 3.5;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { test_id, test_title, correct_count, total, wrong_answers, highlighted_words } = body;

    const band = readingBand(correct_count);
    const wrong = wrong_answers || [];

    const hasWrong = Array.isArray(wrong) && wrong.length > 0;

    const prompt = `You are a senior, certified IELTS Academic Reading examiner and tutor.

Test: ${test_title || "Reading Test"}
Score: ${correct_count}/${total || 40} correct  →  Band ${band}

${
  hasWrong
    ? `The candidate's WRONG answers (with the correct answers) are listed below. For EACH one, explain precisely why this specific mistake happens (e.g. confused with a distractor, missed a paraphrase/synonym, True vs Not Given confusion, scanned the wrong paragraph) and give a concrete strategy to get it right. Point them to where in the passage the answer is found.
WRONG ANSWERS:
${JSON.stringify(wrong, null, 2)}`
    : `No per-question data was captured. Base your analysis on the score (${correct_count}/40) and the most common IELTS Reading failure patterns for this band, and be honest that this is general guidance.`
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
      "explanation": "Precise reason for THIS mistake | O'zbekcha: ...",
      "paragraph_hint": "Where in the passage the answer is (e.g. Paragraph C) | O'zbekcha: ...",
      "tip": "Strategy to get it right next time | O'zbekcha: ..."
    }
  ],
  "vocabulary_insights": [
    { "word": "difficult word from the topic", "definition": "meaning", "example": "usage example" }
  ],
  "strategy_tips": ["Actionable reading strategy | O'zbekcha: ..."],
  "feedback": "Honest, encouraging summary: level now, biggest fix, how to improve | O'zbekcha: ...",
  "weak_question_types": ["True/False/Not Given", "Matching Headings", "Multiple Choice", "Sentence Completion", "Matching Information"]
}
${hasWrong ? "Include one wrong_analysis entry for EVERY wrong answer provided." : "If no wrong answers were provided, return an empty wrong_analysis array and focus on strategy_tips and weak_question_types."}`;

    const feedback = await generateJSON(prompt);
    feedback.correct_count = correct_count;
    feedback.total_questions = total || 40;
    feedback.band_score = band;

    const trial = await checkAndDecrementTrial(req, "reading");
    if (!trial.ok) {
      return NextResponse.json({ error: "Trial limit reached. Please upgrade to Pro." }, { status: 402 });
    }

    const { supabase, user } = await getAuth(req);

    if (user) {
      await supabase.from("reading_results").insert({
        user_id: user.id,
        test_source: test_id,
        total_questions: feedback.total_questions,
        correct_count: feedback.correct_count,
        band_score: feedback.band_score,
        wrong_analysis: feedback.wrong_analysis,
        highlighted_words: highlighted_words || [],
        strategy_tips: feedback.strategy_tips,
        feedback: feedback.feedback,
        time_taken_seconds: 0,
      });
    }

    return NextResponse.json(feedback);
  } catch (error) {
    console.error("Reading feedback error:", error);
    return NextResponse.json({ error: "Feedback generation failed" }, { status: 500 });
  }
}
