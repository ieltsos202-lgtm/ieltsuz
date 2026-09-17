import { NextRequest, NextResponse } from "next/server";
import { getAuth, checkAndDecrementTrial, refundTrial } from "@/lib/supabaseServer";
import { loadSpeakingMemory } from "@/lib/speakingMemory";
import { buildLiveSystemInstruction } from "@/lib/speaking/prompts";

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

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
// Native-audio Live model: audio in, audio out, built-in VAD + barge-in.
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-09-2025";
const AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!GEMINI_KEY) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "exam" ? "exam" : "chat";
    const startPart = Math.min(3, Math.max(1, Number(body?.part) || 1));
    const partnerName = String(body?.partner_name || "Adam").slice(0, 40);
    const userName = String(body?.user_name || "").slice(0, 60);
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
      startPart
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
      // Automatic VAD stays on — that is what makes barge-in work.
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: false },
      },
    };

    const mint = async (withConstraints: boolean) =>
      fetch(AUTH_TOKENS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_KEY,
        },
        body: JSON.stringify(
          withConstraints
            ? {
                config: {
                  uses: 1,
                  // ~30 min covers a full speaking test; the session must be
                  // opened within 2 minutes of minting.
                  expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                  newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                  liveConnectConstraints: { model: LIVE_MODEL, config: sessionConfig },
                },
              }
            : {
                config: {
                  uses: 1,
                  expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                  newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                },
              }
        ),
      });

    // Constraints lock the session to our model+config; if the API build
    // doesn't know the field yet, mint a plain token instead.
    let res = await mint(true);
    if (!res.ok) res = await mint(false);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Ephemeral token mint failed:", res.status, errText.slice(0, 300));
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
