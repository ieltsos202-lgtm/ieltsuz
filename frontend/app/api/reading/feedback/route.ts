import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial, trialDenied } from "@/lib/supabaseServer";
import { rateLimit, clientIp } from "@/lib/rateLimit";

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
    const { test_id, test_title, correct_count, total, wrong_answers, highlighted_words, time_spent_sec, unanswered } = body;

    // Charge the credit BEFORE the AI call — previously the Gemini request ran
    // first, so a user with zero credits still consumed AI quota and the work
    // was discarded when the check failed.
    const trial = await checkAndDecrementTrial(req, "reading");
    if (!trial.ok) {
      const denied = trialDenied(trial);
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }
    if (rateLimit(`reading-fb-ip:${clientIp(req)}`, 20, 10 * 60_000)) {
      return NextResponse.json(
        { error: "Juda ko'p so'rov. Biroz kutib qayta urinib ko'ring." },
        { status: 429 }
      );
    }

    const correct = Math.max(0, Math.min(60, Math.round(Number(correct_count) || 0)));
    const band = readingBand(correct);
    // Cap the per-question payload: it is stringified verbatim into the prompt.
    const wrong = (Array.isArray(wrong_answers) ? wrong_answers : []).slice(0, 40).map((w: any) => ({
      question_number: Math.round(Number(w?.question_number) || 0),
      user_answer: String(w?.user_answer ?? "").slice(0, 200),
      correct_answer: String(w?.correct_answer ?? "").slice(0, 200),
      question_text: String(w?.question_text ?? "").slice(0, 500),
    }));
    const timeSec = Number(time_spent_sec) || 0;
    const skipped: number[] = Array.isArray(unanswered) ? unanswered : [];

    const hasWrong = Array.isArray(wrong) && wrong.length > 0;

    const prompt = `You are a senior, certified IELTS Academic Reading examiner and tutor.

Test: ${String(test_title || "Reading Test").slice(0, 120)}
Score: ${correct}/${total || 40} correct  →  Band ${band}
${timeSec ? `Time spent: ${Math.floor(timeSec / 60)} min ${timeSec % 60} sec (standard test time: 60 min).` : ""}
${skipped.length ? `Questions left UNANSWERED: ${skipped.join(", ")} — comment on time management / which passage they ran out of time on.` : ""}

${
  hasWrong
    ? `The candidate's WRONG answers (with the correct answers) are listed below. For EACH one, explain precisely why this specific mistake happens (e.g. confused with a distractor, missed a paraphrase/synonym, True vs Not Given confusion, scanned the wrong paragraph) and give a concrete strategy to get it right. Point them to where in the passage the answer is found.
WRONG ANSWERS:
${JSON.stringify(wrong, null, 2)}`
    : `No per-question data was captured. Base your analysis on the score (${correct}/40) and the most common IELTS Reading failure patterns for this band, and be honest that this is general guidance.`
}

WRITE BILINGUALLY: every explanation/tip/feedback first in clear English, then the same point in natural Uzbek after " | O'zbekcha: ".

Return ONLY valid JSON with EXACTLY these fields:
{
  "correct_count": ${correct},
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
    feedback.correct_count = correct;
    feedback.total_questions = total || 40;
    feedback.band_score = band;

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
        time_taken_seconds: timeSec,
      });
    }

    return NextResponse.json(feedback);
  } catch (error) {
    console.error("Reading feedback error:", error);
    return NextResponse.json({ error: "Feedback generation failed" }, { status: 500 });
  }
}
