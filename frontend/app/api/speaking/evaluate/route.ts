import { NextRequest, NextResponse } from "next/server";
import { getModel, parseJSONFromText } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial, refundTrial } from "@/lib/supabaseServer";

const EVAL_MODEL = process.env.EVAL_MODEL || "gemini-2.5-flash";

function roundHalf(n: number): number {
  if (typeof n !== "number" || isNaN(n)) return 0;
  const r = Math.round(n * 2) / 2;
  return Math.max(0, Math.min(9, r));
}

async function runInBackground(cb: () => Promise<void>) {
  try {
    const nextServer = await import("next/server");
    const fn = (nextServer as any).after || (nextServer as any).unstable_after;
    if (typeof fn === "function") {
      fn(cb);
      return;
    }
  } catch {
    // ignore
  }
  // Fallback: detach from request lifecycle via setTimeout so Next.js
  // doesn't cancel the promise when the HTTP response finishes.
  setTimeout(() => cb().catch(console.error), 0);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const question = formData.get("question") as string;
    const part = parseInt(formData.get("part") as string);

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const trial = await checkAndDecrementTrial(req, "speaking");
    if (!trial.ok) {
      return NextResponse.json({ error: "Trial limit reached. Please upgrade to Pro." }, { status: 402 });
    }

    const { supabase, user } = await getAuth(req);

    // Try to create background evaluation job
    let jobId: string | null = null;
    try {
      const { data: job, error: jobError } = await (supabase as any)
        .from("evaluation_jobs")
        .insert({
          user_id: user?.id,
          type: "speaking",
          status: "processing",
          payload: { question, part },
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

    const model = getModel(EVAL_MODEL, true);

    const audioBytes = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBytes).toString("base64");

    const partGuidance =
      part === 1
        ? "Part 1: short, personal questions. Expect 2-4 natural sentences. Reward direct answers with reasons/examples."
        : part === 2
        ? "Part 2: a long-turn monologue (cue card). Expect 1.5-2 minutes of connected speech covering all bullet points."
        : "Part 3: abstract discussion. Expect developed, well-justified opinions with a range of structures.";

    const prompt = `You are a senior, certified IELTS Speaking examiner with 15+ years of experience. Mark STRICTLY and ACCURATELY using the official IELTS Speaking band descriptors (0-9). Do not be generous.

IELTS Speaking Part ${part}. ${partGuidance}

QUESTION ASKED: ${question}

STEP 1 — Transcribe EXACTLY what the candidate said, word for word, including hesitations (um, er), false starts and repetitions. Do NOT correct anything in the transcription.
If the audio is silent, empty, inaudible, or not an answer to the question, set transcribed_text to "[No clear speech detected]" and give band scores of 0 with feedback explaining no answer was recorded.

STEP 2 — Score the 4 official criteria (0-9), then set band_score as their average rounded to the nearest 0.5:
1. Fluency & Coherence: speech rate, hesitation, self-correction, linking of ideas.
2. Lexical Resource: range, precision, idiomatic/topic vocabulary, paraphrase.
3. Grammatical Range & Accuracy: range of structures, sentence variety, error frequency.
4. Pronunciation: individual sounds, word/sentence stress, intonation, intelligibility.

STEP 3 — Be concrete and tutoring-focused. In "what_user_said_analysis" quote the candidate's EXACT words and say what was good/weak. In "what_should_have_said" show precisely how to upgrade THEIR answer to Band 7+. Find every real grammar error (quote exact words). Suggest stronger vocabulary they could have used.

IMPORTANT: write every explanation/feedback bilingually — a clear English sentence, then the same point in natural Uzbek after " | O'zbekcha: ".

Return ONLY valid JSON:
{
  "transcribed_text": "Exact word-for-word transcription...",
  "band_score": 6.0,
  "fluency_coherence": 6.0,
  "lexical_resource": 6.5,
  "grammatical_range": 6.0,
  "pronunciation": 5.5,
  "what_user_said_analysis": "Quote their words and analyse | O'zbekcha: ...",
  "what_should_have_said": "How to upgrade their exact answer to Band 7+ | O'zbekcha: ...",
  "model_answer": "A complete Band 8+ model answer to THIS question...",
  "grammar_errors": [
    { "error": "exact phrase they said", "correction": "corrected version", "explanation": "the rule | O'zbekcha: ..." }
  ],
  "vocabulary_suggestions": [
    { "used": "word they used", "better_alternative": "stronger word", "why": "why it scores better | O'zbekcha: ..." }
  ],
  "pronunciation_tips": ["Specific, actionable tip | O'zbekcha: ..."],
  "feedback": "Honest, encouraging summary: level now, single biggest fix, how to reach a higher band | O'zbekcha: ..."
}`;

    // Run AI evaluation in background after response is sent
    runInBackground(async () => {
      try {
        const result = await model.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: audioFile.type || "audio/webm",
              data: audioBase64,
            },
          },
        ]);

        const text = result.response.text();
        const feedback = parseJSONFromText(text);

        // Normalize bands to valid IELTS half-bands.
        feedback.fluency_coherence = roundHalf(feedback.fluency_coherence);
        feedback.lexical_resource = roundHalf(feedback.lexical_resource);
        feedback.grammatical_range = roundHalf(feedback.grammatical_range);
        feedback.pronunciation = roundHalf(feedback.pronunciation);
        const avg =
          (feedback.fluency_coherence +
            feedback.lexical_resource +
            feedback.grammatical_range +
            feedback.pronunciation) /
          4;
        feedback.band_score = roundHalf(feedback.band_score ?? avg) || roundHalf(avg);

        // Save to speaking_results
        if (user) {
          await (supabase as any).from("speaking_results").insert({
            user_id: user.id,
            part,
            question,
            transcribed_text: feedback.transcribed_text,
            band_score: feedback.band_score,
            fluency_coherence: feedback.fluency_coherence,
            lexical_resource: feedback.lexical_resource,
            grammatical_range: feedback.grammatical_range,
            pronunciation: feedback.pronunciation,
            what_user_said_analysis: feedback.what_user_said_analysis,
            what_should_have_said: feedback.what_should_have_said,
            model_answer: feedback.model_answer,
            grammar_errors: feedback.grammar_errors,
            vocabulary_suggestions: feedback.vocabulary_suggestions,
            pronunciation_tips: feedback.pronunciation_tips,
            feedback: feedback.feedback,
          });
        }

        // Update job as completed (only if we created one)
        if (jobId) {
          await (supabase as any)
            .from("evaluation_jobs")
            .update({ status: "completed", result: feedback })
            .eq("id", jobId);

          // Send in-app notification
          if (user) {
            await (supabase as any).from("notifications").insert({
              user_id: user.id,
              title: `Speaking Part ${part} Evaluation Complete`,
              message: `Your answer has been evaluated. Band: ${feedback.band_score}`,
              type: "evaluation",
              read: false,
            });
          }
        }
      } catch (err: any) {
        console.error("Background speaking evaluation error:", err);
        if (jobId) {
          await (supabase as any)
            .from("evaluation_jobs")
            .update({ status: "failed", error: err.message || "Evaluation failed" })
            .eq("id", jobId);
        }
        // Give the trial attempt back since the evaluation never completed.
        await refundTrial(supabase, trial);
      }
    });

    // If we created a background job, return immediately
    if (jobId) {
      return NextResponse.json({ status: "processing", id: jobId });
    }

    // Fallback: evaluate synchronously if job table doesn't exist
    try {
      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: audioFile.type || "audio/webm",
            data: audioBase64,
          },
        },
      ]);

      const text = result.response.text();
      const feedback = parseJSONFromText(text);
      feedback.fluency_coherence = roundHalf(feedback.fluency_coherence);
      feedback.lexical_resource = roundHalf(feedback.lexical_resource);
      feedback.grammatical_range = roundHalf(feedback.grammatical_range);
      feedback.pronunciation = roundHalf(feedback.pronunciation);
      const avg =
        (feedback.fluency_coherence +
          feedback.lexical_resource +
          feedback.grammatical_range +
          feedback.pronunciation) /
        4;
      feedback.band_score = roundHalf(feedback.band_score ?? avg) || roundHalf(avg);

      if (user) {
        await (supabase as any).from("speaking_results").insert({
          user_id: user.id,
          part,
          question,
          transcribed_text: feedback.transcribed_text,
          band_score: feedback.band_score,
          fluency_coherence: feedback.fluency_coherence,
          lexical_resource: feedback.lexical_resource,
          grammatical_range: feedback.grammatical_range,
          pronunciation: feedback.pronunciation,
          what_user_said_analysis: feedback.what_user_said_analysis,
          what_should_have_said: feedback.what_should_have_said,
          model_answer: feedback.model_answer,
          grammar_errors: feedback.grammar_errors,
          vocabulary_suggestions: feedback.vocabulary_suggestions,
          pronunciation_tips: feedback.pronunciation_tips,
          feedback: feedback.feedback,
        });
      }
      return NextResponse.json({
        transcribed_text: feedback.transcribed_text,
        feedback,
      });
    } catch (syncErr: any) {
      console.error("Synchronous speaking evaluation error:", syncErr);
      await refundTrial(supabase, trial);
      return NextResponse.json({ error: syncErr.message || "Evaluation failed" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Speaking evaluation error:", error);
    return NextResponse.json({ error: error?.message || "Evaluation failed" }, { status: 500 });
  }
}
