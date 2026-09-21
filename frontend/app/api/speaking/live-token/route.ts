import { NextRequest, NextResponse } from "next/server";
import { getAuth, checkAndDecrementTrial, refundTrial, trialDenied } from "@/lib/supabaseServer";
import { loadSpeakingMemory } from "@/lib/speakingMemory";
import { buildLiveSystemInstruction } from "@/lib/speaking/prompts";
import { geminiKeys } from "@/lib/gemini";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { maxSessionMs } from "@/lib/speaking/session";

/**
 * Mints a short-lived ephemeral token so the BROWSER can open a direct
 * WebSocket to the Gemini Live API — no server relay, lowest latency.
 *
 * POST → { token, model, sessionConfig }   (charge trial on first turn)
 * DELETE → refunds the trial charge when the socket never connected.
 *
 * The full session config (system instruction, voice, transcription) is built
 * here so the persona never has to be trusted to the client; the client passes
 * it straight through in its WebSocket setup message.
 */

// Live model: audio in, audio out, built-in VAD + barge-in.
//
// Chosen by measurement, not by name. Streaming a real 5s utterance and timing
// the gap from the last speech frame to the first audio byte back:
//   gemini-3.1-flash-live-preview                 1183 / 1475 / 1761 ms
//   gemini-3.8-live                               1344 / 3385 ms  (erratic)
//   gemini-2.5-flash-native-audio-latest          3799 ms
//   gemini-2.5-flash-native-audio-preview-12-2025 3820 ms
//   gemini-2.5-flash-native-audio-preview-09-2025 10769 ms
// The winner also speaks correct Tashkent Uzbek on the Charon voice.
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
// End-of-speech silence window. Short = the examiner answers almost instantly;
// too short and it cuts in while the candidate is still thinking. 250ms was
// tuned on a fluent native speaker and is wrong for this audience: an IELTS
// candidate pauses mid-sentence hunting for a word, the examiner treated that
// as the end of the answer and talked over them. 500ms still feels immediate
// but survives a normal hesitation. Part 2's long turn gets a much wider window
// because 1-2 minutes of monologue is full of pauses.
const SILENCE_MS = Math.max(150, Number(process.env.LIVE_SILENCE_MS) || 500);
const SILENCE_MS_LONG_TURN = Math.max(SILENCE_MS, Number(process.env.LIVE_SILENCE_MS_LONG) || 1500);
// Audio kept BEFORE the detected speech onset. At 20ms the opening consonant
// was being cut off, which both mangled the transcript and made the examiner
// mishear the answer. 200ms is enough to capture the attack of the first word.
const PREFIX_PADDING_MS = Math.max(20, Number(process.env.LIVE_PREFIX_PADDING_MS) || 200);
const AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (rateLimit(`live-token:${user.id}`, 6, 60_000) || rateLimit(`live-token-ip:${clientIp(req)}`, 12, 60_000)) {
      return NextResponse.json({ error: "Juda ko'p so'rov. Bir daqiqadan keyin qayta urinib ko'ring." }, { status: 429 });
    }
    const keys = geminiKeys();
    if (!keys.length) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "exam" ? "exam" : "chat";
    const startPart = Math.min(3, Math.max(1, Number(body?.part) || 1));
    const partnerName = String(body?.partner_name || "Adam").slice(0, 40);
    const userName = String(body?.user_name || "").slice(0, 60);
    const harsh = body?.harsh === true || body?.harsh === "1";
    const firstTurn = body?.first_turn === true || body?.first_turn === "1";

    let charged: Awaited<ReturnType<typeof checkAndDecrementTrial>> | null = null;
    if (firstTurn) {
      charged = await checkAndDecrementTrial(req, "speaking");
      if (!charged.ok) {
        const denied = trialDenied(charged);
        return NextResponse.json({ error: denied.error }, { status: denied.status });
      }
    }

    const memory = await loadSpeakingMemory(supabase, user.id);
    const systemInstruction = buildLiveSystemInstruction(
      mode,
      partnerName,
      userName,
      memory,
      startPart,
      harsh
    );

    // NOTE on shape: responseModalities and speechConfig belong INSIDE
    // generationConfig. At the top level of `setup` the socket rejects them
    // with close code 1007 ("Unknown name responseModalities at 'setup'").
    const sessionConfig = {
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
        },
        // An examiner reads the next question off a script — it has nothing to
        // reason about. Leaving the thinking budget on the default let the model
        // stall for seconds before answering; zero removes that entirely.
        thinkingConfig: { thinkingBudget: 0 },
      },
      systemInstruction: { parts: [{ text: systemInstruction }] },
      // Text record of both sides for the transcript + post-session report.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Turn detection: high sensitivity on both ends so speech onset is caught
      // immediately, with the silence window (above) doing the real work of
      // deciding when the candidate has actually finished. Safe at this
      // sensitivity because the client only forwards mic audio above a
      // barge-in energy threshold while the examiner is speaking — raw speaker
      // echo would otherwise trip "start of speech" and truncate the reply.
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: PREFIX_PADDING_MS,
          silenceDurationMs: startPart === 2 ? SILENCE_MS_LONG_TURN : SILENCE_MS,
        },
      },
      // Gemini Live re-reads the whole session context on every turn, so without
      // compression a full mock gets measurably slower answer after answer and
      // then dies outright around the 15-minute audio limit — mid-Part-3, with
      // the report unwritten. A sliding window holds latency flat and lets the
      // session run the full test.
      contextWindowCompression: {
        triggerTokens: "16000",
        slidingWindow: { targetTokens: "8000" },
      },
      // A dropped socket resumes the same conversation instead of restarting
      // the test from Part 1.
      sessionResumption: {},
    };

    // The AuthToken fields sit at the TOP LEVEL of the body. Wrapping them in
    // `config` fails with HTTP 400 ("Unknown name config at 'auth_token'"), and
    // `liveConnectConstraints` is not a field this API build knows either — the
    // client sends the config in its setup message instead.
    const mint = async (key: string) =>
      fetch(AUTH_TOKENS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          uses: 1,
          // The token dies with the session cap (default 20 min); the session
          // must be opened within 2 minutes of minting.
          expireTime: new Date(Date.now() + maxSessionMs).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        }),
      });

    // A rate-limited key rolls over to the next configured key.
    let res: Response | null = null;
    for (const key of keys) {
      res = await mint(key);
      if (res.ok) break;
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text().catch(() => "") : "no keys";
      console.error("Ephemeral token mint failed:", res?.status, errText.slice(0, 300));
      if (charged?.ok) await refundTrial(supabase, charged);
      return NextResponse.json({ error: "Live session unavailable" }, { status: 503 });
    }

    const data = await res.json().catch(() => ({}));
    const token: string = data?.name || data?.token || "";
    if (!token) {
      if (charged?.ok) await refundTrial(supabase, charged);
      return NextResponse.json({ error: "Live session unavailable" }, { status: 503 });
    }

    return NextResponse.json({ token, model: LIVE_MODEL, sessionConfig });
  } catch (error) {
    console.error("live-token error:", error);
    return NextResponse.json({ error: "Live session unavailable" }, { status: 500 });
  }
}

/** Client calls this when the Live socket never opened — refund the charge. */
export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Refund is idempotent-safe enough for a trial credit: it just increments
    // the column back. Only meaningful right after a POST that charged.
    await refundTrial(supabase, {
      isPro: false,
      userId: user.id,
      refundColumn: "trial_speaking_remaining",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
