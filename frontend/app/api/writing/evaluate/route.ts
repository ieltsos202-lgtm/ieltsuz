import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial, refundTrial, trialDenied } from "@/lib/supabaseServer";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { runInBackground } from "@/lib/backgroundTask";

const EVAL_MODEL = process.env.EVAL_MODEL || "gemini-3.6-flash";
// Roughly 2x a long Task 2 essay. Beyond this the request is not an essay.
const MAX_ESSAY_CHARS = 20000;
const MAX_QUESTION_CHARS = 3000;

/** Never let a refund be the reason a request dies. */
async function safeRefund(supabase: any, trial: any) {
  try {
    await refundTrial(supabase, trial);
  } catch (e) {
    console.error("refundTrial failed (writing evaluate):", e);
  }
}

// Round to the nearest valid IELTS half-band (0.0, 0.5, 1.0, ... 9.0).
function roundHalf(n: number): number {
  if (typeof n !== "number" || isNaN(n)) return 0;
  const r = Math.round(n * 2) / 2;
  return Math.max(0, Math.min(9, r));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { essay_text, question, task_type, word_count } = body;

    // Validate BEFORE spending the user's credit: an empty essay used to
    // consume a trial attempt and come back with meaningless band scores.
    const essay = typeof essay_text === "string" ? essay_text.trim() : "";
    if (essay.length < 20) {
      return NextResponse.json(
        { error: "Insho juda qisqa. Kamida bir necha gap yozing." },
        { status: 400 }
      );
    }
    if (essay.length > MAX_ESSAY_CHARS) {
      return NextResponse.json({ error: "Insho juda uzun." }, { status: 413 });
    }
    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Savol topilmadi." }, { status: 400 });
    }
    if (rateLimit(`writing-eval-ip:${clientIp(req)}`, 15, 10 * 60_000)) {
      return NextResponse.json(
        { error: "Juda ko'p so'rov. Biroz kutib qayta urinib ko'ring." },
        { status: 429 }
      );
    }

    const trial = await checkAndDecrementTrial(req, "writing");
    if (!trial.ok) {
      const denied = trialDenied(trial);
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    const { supabase, user } = await getAuth(req);

    // Try to create background evaluation job
    let jobId: string | null = null;
    try {
      const { data: job, error: jobError } = await (supabase as any)
        .from("evaluation_jobs")
        .insert({
          user_id: user?.id,
          type: "writing",
          status: "processing",
          payload: body,
        })
        .select()
        .single();

      if (jobError) {
        console.warn("evaluation_jobs insert failed (table may not exist yet):", jobError.message || jobError);
      } else if (job) {
        jobId = job.id;
      }
    } catch (jobErr: any) {
      console.warn("evaluation_jobs creation threw:", jobErr?.message || jobErr);
    }

    const isTask1 = task_type === "task1";
    const minWords = isTask1 ? 150 : 250;

    const prompt = `You are a senior, certified IELTS Writing examiner with 15+ years of experience marking the official Academic exam. Mark STRICTLY and ACCURATELY using the official IELTS Writing band descriptors. Do not be generous: if the essay deserves a 5.5, give a 5.5.

TASK TYPE: ${isTask1 ? "Academic Writing Task 1 (report describing a graph/chart/process/map; min 150 words; ~20 minutes)" : "Writing Task 2 (argumentative/discussion essay; min 250 words; ~40 minutes)"}
MINIMUM WORDS: ${minWords}
ACTUAL WORD COUNT: ${
      typeof word_count === "number" && isFinite(word_count)
        ? word_count
        : essay.split(/\s+/).filter(Boolean).length
    }

QUESTION / PROMPT:
${question.slice(0, MAX_QUESTION_CHARS)}

CANDIDATE'S ESSAY:
"""
${essay}
"""

MARKING RULES (apply the official 4 criteria, each 0–9):
1. ${isTask1 ? "Task Achievement" : "Task Response"}: Does it fully address all parts of the task? ${isTask1 ? "Are key features/trends accurately reported with an overview and supporting data?" : "Is there a clear position throughout, with developed and supported ideas?"} Penalise under-length (below ${minWords} words), off-topic content, and missing parts.
2. Coherence & Cohesion: logical paragraphing, clear progression, accurate cohesive devices, referencing. Penalise mechanical or overused linkers.
3. Lexical Resource: range, precision, collocation, spelling, word formation. Penalise repetition and errors that reduce clarity.
4. Grammatical Range & Accuracy: range of structures, sentence variety, punctuation, error frequency. Penalise frequent errors that impede communication.

The overall band_score must be the average of the four criteria, rounded to the nearest 0.5. Be self-consistent: criteria and feedback must justify the scores.

IMPORTANT for explanations: write every explanation/feedback bilingually — first a clear English sentence, then the same point in natural Uzbek after " | O'zbekcha: ". Quote the candidate's EXACT words when correcting.

Find as many real, specific sentence-level errors as exist (aim for 4–8 if present). For each, quote the exact original text, give the corrected version, and explain the rule.

Return ONLY valid JSON with EXACTLY these fields:
{
  "band_score": 6.5,
  "task_achievement": 6.0,
  "coherence_cohesion": 7.0,
  "lexical_resource": 6.5,
  "grammatical_range": 6.0,
  "strengths": ["Specific strength with example | O'zbekcha: ..."],
  "improvements": ["Specific, actionable improvement | O'zbekcha: ..."],
  "sentence_corrections": [
    {
      "original": "exact phrase/sentence copied from the essay",
      "corrected": "the corrected version",
      "explanation": "Which grammar/vocabulary rule and why | O'zbekcha: ..."
    }
  ],
  "model_answer": "A complete Band 8.0+ model answer for THIS exact question (${minWords}+ words).",
  "criterion_feedback": {
    "task_achievement": "Why this score, referencing the essay | O'zbekcha: ...",
    "coherence_cohesion": "Why this score, referencing the essay | O'zbekcha: ...",
    "lexical_resource": "Why this score, referencing the essay | O'zbekcha: ...",
    "grammatical_range": "Why this score, referencing the essay | O'zbekcha: ..."
  },
  "new_vocabulary": [
    { "word": "nevertheless", "definition": "in spite of that", "example": "The results were poor; nevertheless, the team continued." }
  ],
  "feedback": "An honest, encouraging 3-4 sentence summary: current level, the single biggest thing to fix next, and how to reach a higher band | O'zbekcha: ..."
}`;

    // Run AI evaluation in background after response is sent
    runInBackground(async () => {
      try {
        const result = await generateJSON(prompt, EVAL_MODEL);

        // Normalize bands to valid IELTS half-bands.
        result.task_achievement = roundHalf(result.task_achievement);
        result.coherence_cohesion = roundHalf(result.coherence_cohesion);
        result.lexical_resource = roundHalf(result.lexical_resource);
        result.grammatical_range = roundHalf(result.grammatical_range);
        const avg =
          (result.task_achievement +
            result.coherence_cohesion +
            result.lexical_resource +
            result.grammatical_range) /
          4;
        result.band_score = roundHalf(result.band_score ?? avg) || roundHalf(avg);

        // Save to writing_results
        if (user) {
          await (supabase as any).from("writing_results").insert({
            user_id: user.id,
            task_type,
            question,
            essay_text,
            word_count,
            band_score: result.band_score,
            task_achievement: result.task_achievement,
            coherence_cohesion: result.coherence_cohesion,
            lexical_resource: result.lexical_resource,
            grammatical_range: result.grammatical_range,
            strengths: result.strengths,
            improvements: result.improvements,
            sentence_corrections: result.sentence_corrections,
            model_answer: result.model_answer,
            new_vocabulary: result.new_vocabulary,
            feedback: result.feedback,
          });
        }

        // Update job as completed (only if we created one)
        if (jobId) {
          await (supabase as any)
            .from("evaluation_jobs")
            .update({ status: "completed", result })
            .eq("id", jobId);

          // Send in-app notification
          if (user) {
            await (supabase as any).from("notifications").insert({
              user_id: user.id,
              title: "Writing Evaluation Complete",
              message: `Your ${task_type} essay has been evaluated. Overall band: ${result.band_score}`,
              type: "evaluation",
              read: false,
            });
          }
        }
      } catch (err: any) {
        console.error("Background writing evaluation error:", err);
        if (jobId) {
          await (supabase as any)
            .from("evaluation_jobs")
            .update({ status: "failed", error: err.message || "Evaluation failed" })
            .eq("id", jobId);
        }
        // Give the trial attempt back since the evaluation never completed.
        await safeRefund(supabase, trial);
      }
    });

    // If we created a background job, return immediately
    if (jobId) {
      return NextResponse.json({ status: "processing", id: jobId });
    }

    // Fallback: evaluate synchronously (old behaviour) if job table doesn't exist
    try {
      const result = await generateJSON(prompt, EVAL_MODEL);
      result.task_achievement = roundHalf(result.task_achievement);
      result.coherence_cohesion = roundHalf(result.coherence_cohesion);
      result.lexical_resource = roundHalf(result.lexical_resource);
      result.grammatical_range = roundHalf(result.grammatical_range);
      const avg =
        (result.task_achievement +
          result.coherence_cohesion +
          result.lexical_resource +
          result.grammatical_range) /
        4;
      result.band_score = roundHalf(result.band_score ?? avg) || roundHalf(avg);

      if (user) {
        await (supabase as any).from("writing_results").insert({
          user_id: user.id,
          task_type,
          question,
          essay_text,
          word_count,
          band_score: result.band_score,
          task_achievement: result.task_achievement,
          coherence_cohesion: result.coherence_cohesion,
          lexical_resource: result.lexical_resource,
          grammatical_range: result.grammatical_range,
          strengths: result.strengths,
          improvements: result.improvements,
          sentence_corrections: result.sentence_corrections,
          model_answer: result.model_answer,
          new_vocabulary: result.new_vocabulary,
          feedback: result.feedback,
        });
      }
      return NextResponse.json({ feedback: result });
    } catch (syncErr: any) {
      console.error("Synchronous writing evaluation error:", syncErr);
      await safeRefund(supabase, trial);
      return NextResponse.json(
        {
          error: `${syncErr?.message || "Baholashda xatolik."} Urinishingiz qaytarildi.`,
        },
        { status: 503 }
      );
    }
  } catch (error: any) {
    console.error("Writing evaluation error:", error);
    return NextResponse.json({ error: error?.message || "Evaluation failed" }, { status: 500 });
  }
}
