import { NextRequest, NextResponse } from "next/server";
import { QuotaError } from "@/lib/gemini";
import { getAuth, checkAndDecrementTrial, refundTrial } from "@/lib/supabaseServer";
import { loadSpeakingMemory, appendSpeakingMemory } from "@/lib/speakingMemory";
import { streamGeminiText } from "@/lib/speaking/geminiStream";
import { LineProtocolParser } from "@/lib/speaking/lineProtocol";
import { SentenceBuffer } from "@/lib/speaking/sentences";
import { openTtsStream, type TtsStream } from "@/lib/speaking/elevenStream";
import { analyzeTurn, evalTurn } from "@/lib/speaking/agents";
import {
  buildChatPrompt,
  buildExamPrompt,
  normalizeEmotion,
  type HistoryTurn,
} from "@/lib/speaking/prompts";

/**
 * The live turn — multi-agent pipeline.
 *
 *   audio ──► Agent 1 EXAMINER (one streaming call) ──► T: → transcript event
 *     │            │                                  E: → emotion → TTS warm
 *     │            │                                  R: → sentences → mp3
 *     │            ▼
 *     │      Agent 3 ANALYST (audio+transcript)  ──► analysis event
 *     │      Agent 4 SCORER  (transcript)        ──► eval event
 *
 * Critical path = ONE Gemini call that transcribes (T: line) and replies in
 * the same pass — a separate STT round-trip only added dead air. The T: line
 * lands in the first tokens, so the transcript event still reaches the client
 * early, and the Analyst/Scorer launch off-path the moment it arrives.
 *
 * Events (newline-delimited JSON):
 *   {"t":"transcript","v":"what the candidate said"}   — from the T: line
 *   {"t":"meta","transcript":"...","emotion":"happy","cue_card":null}
 *   {"t":"text","v":"first sentence"}
 *   {"t":"audio","v":"<base64 mp3>"}
 *   {"t":"analysis","v":{correction,vocab_tip,pronunciation}}
 *   {"t":"eval","v":{fluency,lexical,grammar,pronunciation,note}}
 *   {"t":"timing","v":{...}}
 *   {"t":"error","v":"message"} | {"t":"done"}
 */

const enc = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let charged: Awaited<ReturnType<typeof checkAndDecrementTrial>> | null = null;

  try {
    const form = await req.formData();
    const audioFile = form.get("audio") as File | null;
    const partnerName = ((form.get("partner_name") as string) || "Adam").slice(0, 40);
    const userName = ((form.get("user_name") as string) || "").slice(0, 60);
    const firstTurn = form.get("first_turn") === "1";
    const mode = form.get("mode") === "exam" ? "exam" : "chat";
    const examInstruction = ((form.get("exam_instruction") as string) || "").slice(0, 600);
    const examPart = Math.min(3, Math.max(1, parseInt((form.get("exam_part") as string) || "1") || 1));
    const examElapsed = Math.max(0, parseInt((form.get("exam_elapsed") as string) || "0") || 0);
    const examCue = ((form.get("exam_cue") as string) || "").slice(0, 500);
    const wantsCueCard = form.get("wants_cue_card") === "1";
    const lastQuestion = ((form.get("last_question") as string) || "").slice(0, 400);
    // Draft transcript from the browser's SpeechRecognition — a hint for the
    // Ear, never trusted blindly.
    const draftTranscript = ((form.get("draft_transcript") as string) || "").slice(0, 1500);
    // The Analyst's pronunciation note about the PREVIOUS turn — lets the
    // examiner voice that correction without hearing the audio itself.
    const pronunciationNotes = ((form.get("pronunciation_notes") as string) || "").slice(0, 400);
    const turnDuration = Math.max(0, parseInt((form.get("turn_duration") as string) || "0") || 0);

    let history: HistoryTurn[] = [];
    try {
      const parsed = JSON.parse((form.get("history") as string) || "[]");
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }

    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!audioFile) return NextResponse.json({ error: "No audio provided" }, { status: 400 });

    if (firstTurn) {
      charged = await checkAndDecrementTrial(req, "speaking");
      if (!charged.ok) {
        return NextResponse.json({ error: "Trial limit reached. Please upgrade to Pro." }, { status: 402 });
      }
    }

    const [audioBytes, memory] = await Promise.all([
      audioFile.arrayBuffer(),
      loadSpeakingMemory(supabase, user.id),
    ]);
    const audioBase64 = Buffer.from(audioBytes).toString("base64");
    const mimeType = (audioFile.type || "audio/webm").split(";")[0];

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const timing: Record<string, number> = {};
        let closed = false;
        const send = (obj: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
          } catch {
            closed = true;
          }
        };

        // A holder keeps the session assignable from nested closures without
        // TypeScript narrowing it to `never` at the call sites below.
        const session: { tts: TtsStream | null; pump: Promise<void> | null } = { tts: null, pump: null };
        // Sentences must reach the TTS context strictly in order, so every
        // synthesis step is appended to a single chain.
        let chain: Promise<void> = Promise.resolve();
        const sentences = new SentenceBuffer();
        let emotion = "neutral";
        let transcript = "";
        let cueCard: { topic: string; bullets: string[] } | null = null;
        let metaSent = false;
        let fullReply = "";

        // TTS can only start once we know the emotion (it selects the voice
        // settings), which the model emits before the reply by design.
        // The in-flight promise is cached: the emotion pre-warm and the first
        // sentence can race, and two overlapping opens would create two
        // sockets whose audio chunks interleave into an unplayable stream.
        let ttsOpening: Promise<TtsStream> | null = null;
        const startTts = () => {
          if (!ttsOpening) {
            ttsOpening = openTtsStream({
              mode,
              emotion,
              onFirstByte: () => {
                timing.first_audio_byte_ms = Date.now() - t0;
              },
            }).then((tts) => {
              session.tts = tts;
              timing.tts_websocket = tts.transport === "websocket" ? 1 : 0;
              const reader = tts.audio.getReader();
              session.pump = (async () => {
                for (;;) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  if (value?.length) send({ t: "audio", v: bytesToBase64(value) });
                }
              })();
              return tts;
            });
          }
          return ttsOpening;
        };

        const speak = (sentence: string) => {
          if (!sentence.trim()) return chain;
          chain = chain.then(async () => {
            send({ t: "text", v: sentence });
            await startTts();
            session.tts?.push(sentence);
          });
          return chain;
        };

        try {
          /* ----- Agents 3 + 4 — ANALYST & SCORER: parallel, off-path ------- */
          // They launch the moment the examiner's T: line lands (or at stream
          // end as a fallback) and report through the same stream whenever
          // they finish — the examiner's voice never waits for them.
          const offPath: Promise<void>[] = [];
          let agentsLaunched = false;
          const launchOffPath = () => {
            if (agentsLaunched) return;
            agentsLaunched = true;
            // The SpeechRecognition draft is the fallback when the model
            // skipped its T: line — better than nothing for the Analyst.
            const heard = transcript || draftTranscript;

            offPath.push(
              analyzeTurn(audioBase64, mimeType, heard, lastQuestion, mode)
                .then(async (a) => {
                  if (!a) return;
                  send({
                    t: "analysis",
                    v: {
                      correction: a.correction,
                      vocab_tip: a.vocab_tip,
                      pronunciation: a.pronunciation
                        ? {
                            issue: a.pronunciation.issue,
                            how_to_say: a.pronunciation.how_to_say,
                            band: a.pronunciation.band,
                          }
                        : null,
                    },
                  });
                  const rem = a.remember;
                  const weak = [...rem.weak_points];
                  if (a.correction) weak.push(`${a.correction.you_said} -> ${a.correction.better}`.slice(0, 120));
                  if (a.pronunciation?.issue) weak.push(`pronunciation: ${a.pronunciation.issue}`.slice(0, 120));
                  if (rem.facts.length || weak.length || rem.topics.length) {
                    const mem = await loadSpeakingMemory(supabase, user.id);
                    await appendSpeakingMemory(supabase, user.id, mem, {
                      facts: rem.facts,
                      weak_points: weak,
                      topics: rem.topics,
                    }).catch(() => {});
                  }
                })
                .catch(() => {})
            );

            // Agent 4 — SCORER: grade this turn while the examiner speaks.
            // Skipped on empty transcripts — grading silence wastes a call.
            if (heard) {
              offPath.push(
                evalTurn(heard, lastQuestion, examPart, turnDuration)
                  .then((ev) => {
                    if (ev) send({ t: "eval", v: ev });
                  })
                  .catch(() => {})
              );
            }
          };

          /* ------- Agent 1 — EXAMINER: audio -> spoken reply --------------- */
          // Audio-mode prompt (no `spoken`): the model transcribes into the
          // T: line itself, so the transcript arrives with the first tokens
          // and the reply starts as soon as R: appears — one round-trip.
          const prompt =
            mode === "exam"
              ? buildExamPrompt(
                  partnerName,
                  userName,
                  history,
                  {
                    instruction: examInstruction || "Continue the test naturally.",
                    part: examPart,
                    elapsed: examElapsed,
                    cueCard: examCue,
                    lastQuestion,
                    wantsCueCard,
                  },
                  memory,
                  "lines"
                )
              : buildChatPrompt(partnerName, userName, history, memory, lastQuestion, "lines");

          const parser = new LineProtocolParser({
            onTranscript: (t) => {
              transcript = t;
              timing.transcript_ms = Date.now() - t0;
              send({ t: "transcript", v: t });
              launchOffPath();
            },
            onEmotion: (e) => {
              emotion = normalizeEmotion(e);
              // Pre-warm: the emotion header always precedes the reply, so the
              // socket handshake overlaps with generation instead of adding to
              // the first sentence's latency.
              void startTts();
            },
            onCueCard: (c) => {
              cueCard = c;
            },
            onReply: (delta) => {
              fullReply += delta;
              if (!metaSent) {
                metaSent = true;
                timing.first_token_ms = timing.first_token_ms ?? Date.now() - t0;
                send({ t: "meta", transcript, emotion, cue_card: cueCard });
              }
              for (const s of sentences.push(delta)) void speak(s);
            },
          });

          for await (const delta of streamGeminiText(
            [{ text: prompt }, { inlineData: { mimeType, data: audioBase64 } }],
            {
              temperature: mode === "exam" ? 0.7 : 0.85,
              maxOutputTokens: mode === "exam" ? 360 : 260,
            }
          )) {
            if (timing.first_gemini_chunk_ms === undefined) {
              timing.first_gemini_chunk_ms = Date.now() - t0;
            }
            parser.push(delta);
          }
          parser.finish();
          // If the model skipped its T: line, still run the off-path agents —
          // the Analyst hears the audio itself and the draft may suffice.
          launchOffPath();

          const tail = sentences.flush();
          if (tail) speak(tail);
          await chain;

          if (!metaSent) {
            // The model produced only headers (or nothing usable).
            metaSent = true;
            send({ t: "meta", transcript, emotion, cue_card: cueCard });
          }

          session.tts?.end();
          if (session.pump) await session.pump;

          // Give the off-path agents a moment to land their events — they are
          // usually done long before the last audio chunk is sent.
          await Promise.race([
            Promise.allSettled(offPath),
            new Promise((r) => setTimeout(r, 8000)),
          ]);

          timing.total_ms = Date.now() - t0;
          send({ t: "timing", v: timing });
          send({ t: "done", reply: fullReply.trim() });
        } catch (e) {
          const quota = e instanceof QuotaError;
          if (charged?.ok) await refundTrial(supabase, charged);
          console.error("live turn failed:", (e as Error)?.message);
          session.tts?.cancel();
          send({
            t: "error",
            v: quota
              ? "AI xizmati hozircha juda band. 20-30 soniyadan keyin qayta urinib ko'ring."
              : "AI javob bera olmadi. Qayta urinib ko'ring.",
          });
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("live route error:", error);
    return NextResponse.json({ error: "Suhbatda xatolik yuz berdi." }, { status: 500 });
  }
}
