import { NextRequest, NextResponse } from "next/server";
import { getModel, parseJSONFromText } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial, refundTrial, updateSpeakingProgress } from "@/lib/supabaseServer";

const EVAL_MODEL = process.env.EVAL_MODEL || "gemini-3.6-flash";

function roundHalf(n: number): number {
  if (typeof n !== "number" || isNaN(n)) return 0;
  const r = Math.round(n * 2) / 2;
  return Math.max(0, Math.min(9, r));
}

interface PartAnswer {
  part: number;
  question: string;
  audioBase64: string;
  mimeType: string;
}

async function transcribeAudio(
  model: any,
  audioBase64: string,
  mimeType: string,
  question: string,
  part: number
): Promise<string> {
  const prompt = `You are an IELTS Speaking examiner. Transcribe EXACTLY what the candidate said in this audio recording for:

Part ${part} Question: ${question}

Rules:
- Transcribe word for word, including hesitations (um, er), false starts, repetitions, and self-corrections.
- Do NOT correct grammar or vocabulary in the transcription.
- If the audio is silent, empty, or inaudible, respond with: [No clear speech detected]
- Return ONLY the transcription text, no markdown, no explanations.`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: audioBase64 } },
    ]);
    return result.response.text().trim();
  } catch (e) {
    console.error("Transcription error:", e);
    return "[Transcription failed]";
  }
}

export async function POST(req: NextRequest) {
  let trial: Awaited<ReturnType<typeof checkAndDecrementTrial>> | null = null;
  let refundSupabase: any = null;
  try {
    const formData = await req.formData();

    // Parse all answers from form data
    // Format: answers[0][part], answers[0][question], answers[0][audio]
    const answers: PartAnswer[] = [];
    let i = 0;
    while (true) {
      const partStr = formData.get(`answers[${i}][part]`) as string | null;
      const question = formData.get(`answers[${i}][question]`) as string | null;
      const audioFile = formData.get(`answers[${i}][audio]`) as File | null;

      if (!partStr || !question || !audioFile) break;

      const audioBytes = await audioFile.arrayBuffer();
      answers.push({
        part: parseInt(partStr),
        question,
        audioBase64: Buffer.from(audioBytes).toString("base64"),
        mimeType: audioFile.type || "audio/webm",
      });
      i++;
    }

    if (answers.length === 0) {
      return NextResponse.json({ error: "No answers provided" }, { status: 400 });
    }

    trial = await checkAndDecrementTrial(req, "speaking");
    if (!trial.ok) {
      return NextResponse.json({ error: "Trial limit reached. Please upgrade to Pro." }, { status: 402 });
    }

    const { supabase, user } = await getAuth(req);
    refundSupabase = supabase;
    const model = getModel(EVAL_MODEL, false);

    // Step 1: Transcribe all answers
    const transcriptions: { part: number; question: string; text: string }[] = [];
    for (const ans of answers) {
      const text = await transcribeAudio(model, ans.audioBase64, ans.mimeType, ans.question, ans.part);
      transcriptions.push({ part: ans.part, question: ans.question, text });
    }

    // Step 2: Build the holistic evaluation prompt
    const part1Transcriptions = transcriptions.filter((t) => t.part === 1);
    const part2Transcription = transcriptions.find((t) => t.part === 2);
    const part3Transcriptions = transcriptions.filter((t) => t.part === 3);

    const buildTranscriptBlock = (items: typeof transcriptions) =>
      items
        .map((t, idx) => `Q${idx + 1}: ${t.question}\nCandidate said: ${t.text}`)
        .join("\n\n");

    const prompt = `You are a senior, certified IELTS Speaking examiner with 15+ years of experience. You have just conducted a complete IELTS Speaking test with a candidate. You must evaluate the ENTIRE test holistically and give ONE overall band score, plus per-part breakdowns.

Mark STRICTLY using the official IELTS Speaking band descriptors (0-9). Do not be generous.

=== FULL TEST TRANSCRIPT ===

--- PART 1 (Introduction & Interview) ---
${buildTranscriptBlock(part1Transcriptions)}

--- PART 2 (Long Turn / Cue Card) ---
${part2Transcription ? `Q: ${part2Transcription.question}\nCandidate said: ${part2Transcription.text}` : "No Part 2 recorded"}

--- PART 3 (Two-way Discussion) ---
${buildTranscriptBlock(part3Transcriptions)}

=== EVALUATION INSTRUCTIONS ===

You must evaluate the candidate's performance across the ENTIRE test holistically. Consider:
- Did their performance improve or decline across parts?
- Were they consistent in vocabulary range, grammar accuracy, fluency?
- Part 1 should show natural, direct answers. Part 2 should show extended coherent discourse. Part 3 should show abstract thinking and justification.

Score the 4 official criteria for the OVERALL test (0-9), then set overall_band as their average rounded to the nearest 0.5:
1. Fluency & Coherence: speech rate, hesitation, self-correction, linking, coherence across the whole test.
2. Lexical Resource: range, precision, idiomatic/topic vocabulary, paraphrase ability across all parts.
3. Grammatical Range & Accuracy: range of structures, sentence variety, error frequency across all parts.
4. Pronunciation: individual sounds, word/sentence stress, intonation, intelligibility.

Also score each part individually (part1_band, part2_band, part3_band) based on what that part specifically demands.

For feedback, be concrete and tutoring-focused:
- In "strengths" list the candidate's best moments with specific quotes.
- In "weaknesses" list the biggest issues with specific quotes.
- In "what_should_have_said" show how to upgrade key answers to Band 7+.
- In "model_answer" give a Band 8+ model for the Part 2 cue card.
- In "grammar_errors" find the most important errors (max 6) with exact quotes.
- In "vocabulary_suggestions" list max 6 upgrades.

IMPORTANT: write every explanation/feedback bilingually — a clear English sentence, then the same point in natural Uzbek after " | O'zbekcha: ".

Return ONLY valid JSON:
{
  "overall_band": 6.5,
  "part1_band": 6.0,
  "part2_band": 7.0,
  "part3_band": 6.5,
  "fluency_coherence": 6.5,
  "lexical_resource": 6.5,
  "grammatical_range": 6.0,
  "pronunciation": 6.5,
  "transcriptions": [
    { "part": 1, "question": "...", "text": "..." }
  ],
  "strengths": ["specific quote and why it was good | O'zbekcha: ..."],
  "weaknesses": ["specific quote and what was wrong | O'zbekcha: ..."],
  "what_should_have_said": "How to upgrade | O'zbekcha: ...",
  "model_answer": "Band 8+ model for Part 2 | O'zbekcha: ...",
  "grammar_errors": [
    { "error": "exact phrase", "correction": "corrected", "explanation": "rule | O'zbekcha: ..." }
  ],
  "vocabulary_suggestions": [
    { "used": "word", "better_alternative": "better word", "why": "why | O'zbekcha: ..." }
  ],
  "pronunciation_tips": ["tip | O'zbekcha: ..."],
  "feedback": "Honest, encouraging summary of the FULL test. What level now, single biggest fix, how to reach higher band | O'zbekcha: ..."
}`;

    const evalModel = getModel(EVAL_MODEL, true);
    const evalResult = await evalModel.generateContent(prompt);
    const evalText = evalResult.response.text();
    const feedback = parseJSONFromText(evalText);

    // Normalize scores
    feedback.fluency_coherence = roundHalf(feedback.fluency_coherence);
    feedback.lexical_resource = roundHalf(feedback.lexical_resource);
    feedback.grammatical_range = roundHalf(feedback.grammatical_range);
    feedback.pronunciation = roundHalf(feedback.pronunciation);
    feedback.overall_band = roundHalf(feedback.overall_band ?? 0) || roundHalf(
      (feedback.fluency_coherence + feedback.lexical_resource + feedback.grammatical_range + feedback.pronunciation) / 4
    );
    feedback.part1_band = roundHalf(feedback.part1_band ?? feedback.overall_band);
    feedback.part2_band = roundHalf(feedback.part2_band ?? feedback.overall_band);
    feedback.part3_band = roundHalf(feedback.part3_band ?? feedback.overall_band);

    // Save result
    if (user) {
      try {
        await (supabase as any).from("speaking_results").insert({
          user_id: user.id,
          part: 0, // 0 = full test
          test_source: "full-speaking-test",
          question: "Full IELTS Speaking Test (Parts 1, 2, 3)",
          transcribed_text: transcriptions.map((t) => `[Part ${t.part}] ${t.question}: ${t.text}`).join("\n\n"),
          band_score: feedback.overall_band,
          fluency_coherence: feedback.fluency_coherence,
          lexical_resource: feedback.lexical_resource,
          grammatical_range: feedback.grammatical_range,
          pronunciation: feedback.pronunciation,
          what_user_said_analysis: feedback.strengths?.join("\n") + "\n\n" + feedback.weaknesses?.join("\n"),
          what_should_have_said: feedback.what_should_have_said || "",
          model_answer: feedback.model_answer || "",
          grammar_errors: feedback.grammar_errors || [],
          vocabulary_suggestions: feedback.vocabulary_suggestions || [],
          pronunciation_tips: feedback.pronunciation_tips || [],
          feedback: feedback.feedback || "",
          details: {
            overall_band: feedback.overall_band,
            part1_band: feedback.part1_band,
            part2_band: feedback.part2_band,
            part3_band: feedback.part3_band,
            strengths: feedback.strengths,
            weaknesses: feedback.weaknesses,
            transcriptions,
          },
        });
        await updateSpeakingProgress(supabase, user.id, {
          bandScore: feedback.overall_band,
          grammarErrors: feedback.grammar_errors,
        });
      } catch (saveErr) {
        console.error("Failed to save speaking result:", saveErr);
      }
    }

    return NextResponse.json({
      status: "completed",
      feedback,
      transcriptions,
    });
  } catch (error: any) {
    console.error("Speaking full evaluation error:", error);
    if (trial && refundSupabase) {
      await refundTrial(refundSupabase, trial);
    }
    return NextResponse.json({ error: error?.message || "Evaluation failed" }, { status: 500 });
  }
}
