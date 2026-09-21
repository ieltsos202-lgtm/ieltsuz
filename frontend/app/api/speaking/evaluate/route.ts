import { NextRequest, NextResponse } from "next/server";
import {
  parseJSONFromText,
  generateWithFallback,
  QuotaError,
  LIVE_MODEL_CHAIN,
} from "@/lib/gemini";
import {
  getAuth,
  checkAndDecrementTrial,
  refundTrial,
  updateSpeakingProgress,
  trialDenied,
} from "@/lib/supabaseServer";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const EVAL_MODEL = process.env.EVAL_MODEL || "gemini-3.6-flash";
const EVAL_MODELS = [EVAL_MODEL, ...LIVE_MODEL_CHAIN.filter((m) => m !== EVAL_MODEL)];
// One spoken answer. Anything beyond this is not a Part 1-3 response.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

/** Never let a refund be the reason a request dies. */
async function safeRefund(supabase: any, trial: any) {
  try {
    await refundTrial(supabase, trial);
  } catch (e) {
    console.error("refundTrial failed (speaking evaluate):", e);
  }
}

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
    const question = ((formData.get("question") as string) || "").slice(0, 1000);
    // A missing or malformed part used to become NaN and be written straight
    // into the results row, where the database rejected it.
    const parsedPart = parseInt((formData.get("part") as string) || "", 10);
    const part = parsedPart === 1 || parsedPart === 2 || parsedPart === 3 ? parsedPart : 1;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    if (!audioFile.size) {
      return NextResponse.json({ error: "Yozuv bo'sh. Qayta urinib ko'ring." }, { status: 400 });
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Yozuv juda katta." }, { status: 413 });
    }
    if (rateLimit(`speak-eval-ip:${clientIp(req)}`, 20, 10 * 60_000)) {
      return NextResponse.json(
        { error: "Juda ko'p so'rov. Biroz kutib qayta urinib ko'ring." },
        { status: 429 }
      );
    }

    const trial = await checkAndDecrementTrial(req, "speaking");
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

    const audioBytes = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBytes).toString("base64");
    const audioMime = audioFile.type || "audio/webm";

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

    // One definition for both the background and synchronous paths, so they
    // cannot drift apart. Parse validation is part of the attempt: a truncated
    // response retries on the next model rather than failing the evaluation.
    const evaluate = async () => {
      const text = await generateWithFallback(
        [{ text: prompt }, { inlineData: { mimeType: audioMime, data: audioBase64 } }],
        {
          models: EVAL_MODELS,
          validate: (t) => {
            parseJSONFromText(t);
          },
        }
      );
      return parseJSONFromText(text);
    };

    // Run AI evaluation in background after response is sent
    runInBackground(async () => {
      try {
        const feedback = await evaluate();

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
          await updateSpeakingProgress(supabase, user.id, {
            bandScore: feedback.band_score,
            grammarErrors: feedback.grammar_errors,
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
        await safeRefund(supabase, trial);
      }
    });

    // If we created a background job, return immediately
    if (jobId) {
      return NextResponse.json({ status: "processing", id: jobId });
    }

    // Fallback: evaluate synchronously if job table doesn't exist
    try {
      const feedback = await evaluate();
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
        await updateSpeakingProgress(supabase, user.id, {
          bandScore: feedback.band_score,
          grammarErrors: feedback.grammar_errors,
        });
      }
      return NextResponse.json({
        transcribed_text: feedback.transcribed_text,
        feedback,
      });
    } catch (syncErr: any) {
      console.error("Synchronous speaking evaluation error:", syncErr);
      await safeRefund(supabase, trial);
      const quota = syncErr instanceof QuotaError;
      return NextResponse.json(
        {
          error: quota
            ? "AI xizmati hozircha band (limit). Urinishingiz qaytarildi — bir ozdan keyin qayta urinib ko'ring."
            : "Baholashda xatolik. Urinishingiz qaytarildi — qayta urinib ko'ring.",
        },
        { status: quota ? 503 : 500 }
      );
    }
  } catch (error: any) {
    console.error("Speaking evaluation error:", error);
    return NextResponse.json({ error: error?.message || "Evaluation failed" }, { status: 500 });
  }
}
