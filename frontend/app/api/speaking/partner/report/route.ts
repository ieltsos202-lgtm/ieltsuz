import { NextRequest, NextResponse } from "next/server";
import {
  parseJSONFromText,
  generateWithFallback,
  QuotaError,
  LIVE_MODEL_CHAIN,
} from "@/lib/gemini";
import { getAuth, updateSpeakingProgress } from "@/lib/supabaseServer";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { computeSessionMetrics, describeMetrics } from "@/lib/speaking/metrics";

const REPORT_MODEL = process.env.EVAL_MODEL || "gemini-3.6-flash";
// The report model chain: the configured model first, then every other
// audio-capable Flash model. generateWithFallback walks this against every
// configured API key, so a rate-limited key or an overloaded model no longer
// costs the candidate their entire finished test.
const REPORT_MODELS = [REPORT_MODEL, ...LIVE_MODEL_CHAIN.filter((m) => m !== REPORT_MODEL)];
// This JSON is long — four criteria with bilingual evidence, five corrections
// and three drills. At the default 8192 it could truncate mid-object, which
// surfaced as an unparseable response rather than an obvious cap.
const REPORT_MAX_TOKENS = 16384;
// Inline audio ceiling. base64 inflates this by ~4/3 and the prompt rides
// along, so 8MB of audio leaves comfortable headroom under the API's inline
// request limit. The live path's 3-minute WAV is ~5.8MB and fits whole.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function roundHalf(n: number): number {
  if (typeof n !== "number" || isNaN(n)) return 0;
  const r = Math.round(n * 2) / 2;
  return Math.max(0, Math.min(9, r));
}

interface HistoryTurn {
  role: "user" | "partner";
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const mode = formData.get("mode") === "exam" ? "exam" : "chat";
    const examinerName = ((formData.get("partner_name") as string) || "Examiner").slice(0, 40);

    let turns: HistoryTurn[] = [];
    try {
      turns = JSON.parse((formData.get("turns") as string) || "[]");
      if (!Array.isArray(turns)) turns = [];
    } catch {
      turns = [];
    }

    const userTurns = turns.filter((t) => t.role === "user");
    if (userTurns.length === 0) {
      return NextResponse.json({ error: "Not enough speech to evaluate." }, { status: 400 });
    }

    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (rateLimit(`report:${user.id}`, 6, 10 * 60_000) || rateLimit(`report-ip:${clientIp(req)}`, 12, 10 * 60_000)) {
      return NextResponse.json({ error: "Juda ko'p so'rov. Biroz kutib qayta urinib ko'ring." }, { status: 429 });
    }

    // All the candidate's recorded turns (webm blobs), in order — lets Gemini
    // assess real pronunciation, pace, pauses and fillers, not just text.
    // Oldest-first, and stop once the inline budget is spent: the live path can
    // send a 3-minute WAV, and silently blowing the request limit used to lose
    // the report entirely.
    const audioFiles = (formData.getAll("audio") as File[]).slice(0, 25);
    const audioParts: { inlineData: { mimeType: string; data: string } }[] = [];
    let audioBytes = 0;
    for (const f of audioFiles) {
      if (audioBytes + f.size > MAX_AUDIO_BYTES) continue;
      audioBytes += f.size;
      audioParts.push({
        inlineData: {
          mimeType: f.type || "audio/webm",
          data: Buffer.from(await f.arrayBuffer()).toString("base64"),
        },
      });
    }

    // Measured speaking time per answer, sent by the client (0 if unavailable).
    let speakingSeconds = 0;
    try {
      const parsedDurations = JSON.parse((formData.get("durations") as string) || "[]");
      if (Array.isArray(parsedDurations)) {
        speakingSeconds = parsedDurations
          .map((n: unknown) => (typeof n === "number" && isFinite(n) ? n : 0))
          .reduce((a: number, b: number) => a + b, 0);
      }
    } catch {
      speakingSeconds = 0;
    }
    const metrics = computeSessionMetrics(userTurns.map((t) => t.text), speakingSeconds);

    // Agent 4's running scores — one entry per candidate answer, produced
    // during the session (the Analyst's audio-based pronunciation band is
    // folded in). When present, they are the report's primary evidence and
    // the model synthesises rather than re-discovers.
    let evals: { fluency: number | null; lexical: number | null; grammar: number | null; pronunciation: number | null; note: string }[] = [];
    try {
      const parsedEvals = JSON.parse((formData.get("evals") as string) || "[]");
      if (Array.isArray(parsedEvals)) evals = parsedEvals;
    } catch {
      evals = [];
    }
    const evalsBlock =
      evals.length > 0
        ? `\nPER-TURN EXAMINER NOTES (the Scorer graded each answer as it happened; pronunciation bands came from the Analyst who heard the actual audio — treat these as expert observations, not guesses):\n${evals
            .map(
              (e, i) =>
                `Answer ${i + 1}: fluency ${e.fluency ?? "?"}, lexical ${e.lexical ?? "?"}, grammar ${e.grammar ?? "?"}, pronunciation ${e.pronunciation ?? "?"} — ${e.note || ""}`
            )
            .join("\n")}\n`
        : "";

    const transcriptBlock = turns
      .map((t) => `${t.role === "user" ? "Candidate" : examinerName}: ${t.text}`)
      .join("\n");

    const sessionKind =
      mode === "exam"
        ? "a full simulated IELTS Speaking test (Part 1 interview, Part 2 cue-card long turn, Part 3 discussion)"
        : "a free conversation practice session";

    // PROMPT B — End-of-Session Report: runs once, on the full transcript plus
    // every recorded answer (so pronunciation/prosody signal IS available).
    const prompt = `You are an IELTS Speaking examiner producing the official-style band report for a candidate after ${sessionKind} has ended. You have the full transcript and the candidate's actual audio recordings (attached, in chronological order) — use them for pronunciation/prosody signals (pace, pauses, stress accuracy).

FULL SESSION TRANSCRIPT:
${transcriptBlock}

MEASURED SESSION METRICS (counted from the transcript and the recordings — treat these as facts, do not contradict them):
${describeMetrics(metrics)}
${evalsBlock}
Assess the candidate across the four official IELTS Speaking criteria, weighted equally:

1. FLUENCY & COHERENCE — Can they speak at length with minimal hesitation? Do ideas connect logically with a range of linking words (not just "and", "but")? Is there natural self-correction versus repeated stumbling? Excessive filler words, long pauses, or heavy reliance on repetition should pull the score down.

2. LEXICAL RESOURCE — Range and precision of vocabulary. Can they discuss abstract Part 3 topics with less common vocabulary and some idiomatic language, or do they repeat basic words? Note any clearly wrong word choices or L1-influenced word choices.

3. GRAMMATICAL RANGE & ACCURACY — Variety of sentence structures (simple vs. complex, conditionals, relative clauses, passive voice) and how error-free they are. Frequent basic errors (articles, subject-verb agreement, tense) cap the score lower even if vocabulary is strong.

4. PRONUNCIATION — Based on the attached audio (word stress, intonation, connected speech, intelligibility) — NOT accent. Note specific words or sound patterns that reduced clarity. If no audio is attached but per-turn examiner notes include pronunciation bands, base this section on those. If neither is available, state this limitation clearly instead of guessing a precise score.

For each criterion: give a band (use halves, e.g. 6.5) and 2-3 specific pieces of evidence quoted or closely paraphrased from what the candidate actually said — never generic feedback. Then give an overall band (typically the rounded average, adjusted for markedly weak areas that would realistically cap a real examiner's overall impression).

COMMON ERROR PATTERNS FOR UZBEK/RUSSIAN-L1 CANDIDATES — actively check for and flag these, since they are the most frequent score-limiters for this candidate pool:
- Article errors (a/an/the omission or misuse — Uzbek/Russian have no articles)
- Preposition errors (at/in/on confusion, "depend from" instead of "depend on")
- Present tense used for habitual/future where a different tense is more natural
- Direct translation of local idioms/expressions that don't work in English
- Overly formal/bookish vocabulary in Part 1 (sounds unnatural for casual questions)

IMPORTANT: write every evidence/feedback string bilingually — a clear English sentence, then the same point in natural Uzbek after " | O'zbekcha: ".

OUTPUT — return strict JSON, no markdown, matching this shape:
{
  "overall_band": 6.5,
  "criteria": {
    "fluency_coherence": {"band": 6.5, "evidence": ["...", "..."]},
    "lexical_resource": {"band": 6.0, "evidence": ["...", "..."]},
    "grammatical_range": {"band": 7.0, "evidence": ["...", "..."]},
    "pronunciation": {"band": 6.5, "evidence": ["...", "..."], "signal_available": true}
  },
  "strengths": ["...", "..."],
  "priority_fixes": ["...", "..."],
  "l1_interference_notes": ["...", "..."],
  "corrected_examples": [
    {"said": "...", "better": "...", "why": "..."}
  ],
  "drills": [
    {"title": "short drill name in Uzbek", "instruction": "what to do, 1-2 sentences in Uzbek", "example": "one model sentence in English"}
  ],
  "examiner_summary": "2-3 sentence natural-language summary in an encouraging but honest tone.",
  "spoken_summary": "ONE short English sentence the examiner says aloud at the end (no numbers, no markdown)."
}

RULES FOR corrected_examples: the TOP 5 RECURRING errors, most frequent first — "said" is the candidate's exact sentence from the transcript, "better" the corrected English sentence, "why" a one-line explanation in Uzbek.
RULES FOR drills: exactly 3 concrete, doable drills targeting the recurring errors above — instructions in Uzbek, the example sentence in English.
The pronunciation band is an ESTIMATE from audio/notes — say so in its first evidence line.`;

    // Generate and parse as one unit: a truncated or fence-mangled response is
    // a failed attempt, not a dead request, so it falls through to the next
    // model/key like any other error would.
    const attempt = async (withAudio: boolean) => {
      const raw = await generateWithFallback(
        withAudio ? [{ text: prompt }, ...audioParts] : [{ text: prompt }],
        {
          // The audio attempt stays on one model but still rotates every key —
          // key rotation is what recovers a quota failure, and re-sending a
          // multi-megabyte payload across the whole model chain would exhaust
          // the worker's CPU budget before it ever succeeded. The cheap
          // audio-less attempt gets the full chain.
          models: withAudio ? [REPORT_MODEL] : REPORT_MODELS,
          config: { maxOutputTokens: REPORT_MAX_TOKENS },
        }
      );
      return parseJSONFromText(raw);
    };

    let parsed: any = null;
    let audioUsed = audioParts.length > 0;
    let quotaHit = false;
    let lastErr: unknown = null;

    try {
      parsed = await attempt(audioUsed);
    } catch (e) {
      lastErr = e;
      quotaHit = e instanceof QuotaError;
    }

    // Last resort: drop the audio. If the attachment is what the API is
    // rejecting (too large, unsupported container), the transcript plus the
    // per-turn notes — whose pronunciation bands came from the audio while the
    // session was live — still make a real report. Losing a finished test is
    // never the better outcome.
    if (!parsed && audioUsed) {
      try {
        parsed = await attempt(false);
        audioUsed = false;
        console.warn("Report: audio-less fallback succeeded after:", lastErr);
      } catch (e) {
        lastErr = e;
        quotaHit = quotaHit || e instanceof QuotaError;
      }
    }

    if (!parsed) {
      console.error("Speaking partner report generation failed:", lastErr);
      return NextResponse.json(
        {
          error: quotaHit
            ? "AI xizmati hozircha band (limit). Bir ozdan keyin qayta urinib ko'ring."
            : "Hisobot tayyorlashda xatolik. Qayta urinib ko'ring.",
        },
        { status: 503 }
      );
    }

    const crit = (c: any) => ({
      band: roundHalf(c?.band),
      evidence: Array.isArray(c?.evidence) ? c.evidence.slice(0, 4).map(String) : [],
    });
    const criteria = {
      fluency_coherence: crit(parsed.criteria?.fluency_coherence),
      lexical_resource: crit(parsed.criteria?.lexical_resource),
      grammatical_range: crit(parsed.criteria?.grammatical_range),
      pronunciation: {
        ...crit(parsed.criteria?.pronunciation),
        // Honest even when the audio-less fallback ran: the per-turn bands were
        // themselves derived from audio while the session was live, so they
        // still count as signal — nothing else does.
        signal_available:
          parsed.criteria?.pronunciation?.signal_available !== false &&
          (audioUsed || evals.some((e) => e?.pronunciation != null)),
      },
    };
    const avg =
      (criteria.fluency_coherence.band +
        criteria.lexical_resource.band +
        criteria.grammatical_range.band +
        criteria.pronunciation.band) /
      4;
    const overallBand = roundHalf(parsed.overall_band ?? avg) || roundHalf(avg);

    const correctedExamples = Array.isArray(parsed.corrected_examples)
      ? parsed.corrected_examples
          .filter((c: any) => c && c.said && c.better)
          .slice(0, 15)
      : [];
    const drills = Array.isArray(parsed.drills)
      ? parsed.drills
          .filter((d: any) => d && (d.title || d.instruction))
          .slice(0, 3)
          .map((d: any) => ({
            title: String(d.title || ""),
            instruction: String(d.instruction || ""),
            example: String(d.example || ""),
          }))
      : [];

    const report = {
      overall_band: overallBand,
      criteria,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6).map(String) : [],
      priority_fixes: Array.isArray(parsed.priority_fixes)
        ? parsed.priority_fixes.slice(0, 6).map(String)
        : [],
      l1_interference_notes: Array.isArray(parsed.l1_interference_notes)
        ? parsed.l1_interference_notes.slice(0, 8).map(String)
        : [],
      corrected_examples: correctedExamples,
      drills,
      examiner_summary: typeof parsed.examiner_summary === "string" ? parsed.examiner_summary : "",
      spoken_summary: typeof parsed.spoken_summary === "string" ? parsed.spoken_summary.slice(0, 240) : "",
      metrics,
    };

    // Best-effort persistence — never blocks the report.
    try {
      await (supabase as any).from("speaking_results").insert({
        user_id: user.id,
        part: 1,
        question:
          mode === "exam" ? "Live AI Examiner — full simulated test" : "Live speaking partner session",
        transcribed_text: userTurns.map((t) => t.text).join("\n"),
        band_score: report.overall_band,
        fluency_coherence: report.criteria.fluency_coherence.band,
        lexical_resource: report.criteria.lexical_resource.band,
        grammatical_range: report.criteria.grammatical_range.band,
        pronunciation: report.criteria.pronunciation.band,
        grammar_errors: report.corrected_examples.map((c: any) => ({
          error: c.said,
          correction: c.better,
          explanation: c.why || "",
        })),
        feedback: report.examiner_summary,
      });
    } catch (e) {
      console.error("speaking_results insert failed (partner report):", e);
    }
    // Also best-effort: the report is already generated and the session is
    // over, so a progress-tracking hiccup must never be what the candidate
    // sees instead of their band score.
    try {
      await updateSpeakingProgress(supabase, user.id, {
        bandScore: report.overall_band,
        grammarErrors: report.corrected_examples.map((c: any) => ({
          error: c.said,
          correction: c.better,
        })),
      });
    } catch (e) {
      console.error("updateSpeakingProgress failed (partner report):", e);
    }

    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Speaking partner report error:", error);
    return NextResponse.json(
      { error: "Hisobot tayyorlashda xatolik yuz berdi. Qayta urinib ko'ring." },
      { status: 500 }
    );
  }
}
