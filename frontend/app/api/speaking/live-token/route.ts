import { NextRequest, NextResponse } from "next/server";
import { getAuth, checkAndDecrementTrial, refundTrial } from "@/lib/supabaseServer";
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
 * here so the persona never has to be trusted to the client. It is also sent
 * as liveConnectConstraints on the token where the API supports it — the
 * client echoes the same config in its setup message either way.
 */

// Native-audio Live model: audio in, audio out, built-in VAD + barge-in.
const LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
// End-of-speech silence window. Short = the examiner answers almost instantly;
// too short and it cuts in while the candidate is still thinking. Part 2's long
// turn gets a wider window because pausing mid-answer is normal there.
const SILENCE_MS = Math.max(150, Number(process.env.LIVE_SILENCE_MS) || 450);
const SILENCE_MS_LONG_TURN = SILENCE_MS * 3;
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
        return NextResponse.json(
          { error: "Trial limit reached. Please upgrade to Pro." },
          { status: 402 }
        );
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

    const sessionConfig = {
      responseModalities: ["AUDIO"],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
      },
      // Text record of both sides for the transcript + post-session report.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Turn detection, tuned the way the Jarvis assistant does it: HIGH
      // sensitivity on both ends with minimal prefix padding and a short
      // silence window, so the examiner starts answering the moment the
      // candidate stops. Safe at this sensitivity because the client stops
      // sending mic audio while the examiner is speaking — without that gate,
      // speaker echo trips "start of speech" and truncates the reply.
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 20,
          silenceDurationMs: startPart === 2 ? SILENCE_MS_LONG_TURN : SILENCE_MS,
        },
      },
      // A dropped socket resumes the same conversation instead of restarting
      // the test from Part 1.
      sessionResumption: {},
    };

    const mint = async (key: string, withConstraints: boolean) =>
      fetch(AUTH_TOKENS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(
          withConstraints
            ? {
                config: {
                  uses: 1,
                  // The token dies with the session cap (default 20 min); the
                  // session must be opened within 2 minutes of minting.
                  expireTime: new Date(Date.now() + maxSessionMs).toISOString(),
                  newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                  liveConnectConstraints: { model: LIVE_MODEL, config: sessionConfig },
                },
              }
            : {
                config: {
                  uses: 1,
                  expireTime: new Date(Date.now() + maxSessionMs).toISOString(),
                  newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                },
              }
        ),
      });

    // Constraints lock the session to our model+config; if the API build
    // doesn't know the field yet, mint a plain token instead. A rate-limited
    // key rolls over to the next configured key.
    let res: Response | null = null;
    for (const key of keys) {
      res = await mint(key, true);
      if (!res.ok) res = await mint(key, false);
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
