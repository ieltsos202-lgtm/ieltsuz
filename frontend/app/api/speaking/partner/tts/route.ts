import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { ELEVENLABS_UZBEK_MODEL_ID, isProbablyUzbek } from "@/lib/speaking/voice";

const TTS_PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
const TTS_MODEL = process.env.TTS_MODEL || "gemini-2.5-flash-preview-tts";
const TTS_VOICE = process.env.TTS_VOICE || "Aoede";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
// George — warm British male that holds up well across languages (incl. Turkic).
// Swap via ELEVENLABS_VOICE_ID for another voice.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
// Primary: turbo v2.5 (~250ms first byte, 32 langs, good quality).
// Fallback: flash v2.5 (~75ms). multilingual_v2 sounds slightly richer but its
// ~1s+ first byte is the single biggest source of "the examiner is slow".
// If the primary is not enabled on the account we remember that for 10
// minutes so every turn doesn't pay for a failed request.
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const ELEVENLABS_FALLBACK_MODEL_ID = process.env.ELEVENLABS_FALLBACK_MODEL_ID || "eleven_flash_v2_5";
let primaryDisabledUntil = 0;

// v3 understands inline performance tags — lets the voice actually sound angry / laugh.
const V3_TAGS: Record<string, string> = {
  happy: "[cheerful]",
  laughing: "[laughs]",
  excited: "[excited]",
  neutral: "",
  thinking: "[thoughtful]",
  surprised: "[surprised]",
  sad: "[sad]",
  annoyed: "[angry]",
  encouraging: "[warmly]",
};

/**
 * Uzbek Latin uses apostrophes (o', g') that English-tuned TTS engines read as
 * glottal stops or pauses. Normalising them (and x → h) gives a much more
 * natural reading. For the multilingual model we keep the apostrophes.
 */
function normalizeUzbekForTTS(text: string, keepApostrophes = false): string {
  let t = text;
  if (!keepApostrophes) {
    t = t.replace(/([oOgG])[‘’ʻʼ'`´]/g, "$1");
  }
  return t
    .replace(/(^|[^a-zA-Z])x([a-z])/g, "$1h$2")
    .replace(/(^|[^a-zA-Z])X([a-z])/g, "$1H$2");
}

function isV3(modelId: string) {
  return modelId.startsWith("eleven_v3");
}
function isFast(modelId: string) {
  return /turbo|flash/.test(modelId);
}

function settingsFor(modelId: string, s: VoiceSettings) {
  if (isV3(modelId)) {
    // v3 only accepts stability 0 (creative) / 0.5 (natural) / 1 (robust)
    const stability = s.stability < 0.33 ? 0 : s.stability < 0.75 ? 0.5 : 1;
    return { stability, similarity_boost: s.similarity_boost, use_speaker_boost: s.use_speaker_boost };
  }
  // On turbo/flash, style exaggeration and speaker boost both add latency.
  if (isFast(modelId)) {
    return { ...s, style: Math.min(s.style, 0.3), use_speaker_boost: false };
  }
  return s;
}

async function elevenRequest(modelId: string, text: string, settings: VoiceSettings) {
  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    voice_settings: settingsFor(modelId, settings),
    output_format: "mp3_44100_128",
  };
  if (!isV3(modelId)) body.optimize_streaming_latency = isFast(modelId) ? 3 : 0;
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
}

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

// Chat mode: expressive, human, emotional — lower stability = more natural variation
const CHAT_VOICE: Record<string, VoiceSettings> = {
  happy: { stability: 0.28, similarity_boost: 0.78, style: 0.65, use_speaker_boost: true },
  laughing: { stability: 0.18, similarity_boost: 0.72, style: 0.85, use_speaker_boost: true },
  excited: { stability: 0.16, similarity_boost: 0.70, style: 0.90, use_speaker_boost: true },
  neutral: { stability: 0.38, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
  thinking: { stability: 0.50, similarity_boost: 0.85, style: 0.20, use_speaker_boost: true },
  surprised: { stability: 0.25, similarity_boost: 0.75, style: 0.60, use_speaker_boost: true },
  sad: { stability: 0.55, similarity_boost: 0.88, style: 0.12, use_speaker_boost: true },
  annoyed: { stability: 0.20, similarity_boost: 0.80, style: 0.80, use_speaker_boost: true },
  encouraging: { stability: 0.35, similarity_boost: 0.85, style: 0.50, use_speaker_boost: true },
};

// Exam mode: calm, professional, real examiner — higher stability
const EXAM_VOICE: Record<string, VoiceSettings> = {
  happy: { stability: 0.55, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true },
  laughing: { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
  excited: { stability: 0.50, similarity_boost: 0.83, style: 0.30, use_speaker_boost: true },
  neutral: { stability: 0.62, similarity_boost: 0.88, style: 0.15, use_speaker_boost: true },
  thinking: { stability: 0.65, similarity_boost: 0.90, style: 0.10, use_speaker_boost: true },
  surprised: { stability: 0.52, similarity_boost: 0.85, style: 0.22, use_speaker_boost: true },
  sad: { stability: 0.68, similarity_boost: 0.90, style: 0.08, use_speaker_boost: true },
  annoyed: { stability: 0.55, similarity_boost: 0.86, style: 0.20, use_speaker_boost: true },
  encouraging: { stability: 0.58, similarity_boost: 0.87, style: 0.25, use_speaker_boost: true },
};

const EMOTION_STYLE: Record<string, string> = {
  happy: "cheerful, warm and smiling",
  laughing: "laughing out loud, extremely amused",
  excited: "very excited and energetic",
  neutral: "relaxed, casual and friendly",
  thinking: "thoughtful and slow",
  surprised: "genuinely shocked and curious",
  sad: "soft, gentle and empathetic",
  annoyed: "genuinely annoyed, scolding, raised voice",
  encouraging: "warm, supportive and motivating",
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const text = (body?.text || "").toString().slice(0, 1200);
    const emotion = (body?.emotion || "neutral").toString();
    const mode = body?.mode === "exam" ? "exam" : "chat";
    if (!text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const voiceMap = mode === "exam" ? EXAM_VOICE : CHAT_VOICE;
    const settings = voiceMap[emotion] || voiceMap.neutral;

    if (TTS_PROVIDER === "elevenlabs") {
      if (!ELEVENLABS_API_KEY) {
        return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
      }

      // Uzbek text needs the multilingual model — turbo/flash mangle it.
      const uzbek = isProbablyUzbek(text);
      const spoken = normalizeUzbekForTTS(text, uzbek);
      const tag = mode === "chat" ? V3_TAGS[emotion] ?? "" : "";
      const primaryModel = uzbek ? ELEVENLABS_UZBEK_MODEL_ID : ELEVENLABS_MODEL_ID;

      let elevenRes: Response | null = null;
      if (uzbek || Date.now() >= primaryDisabledUntil) {
        elevenRes = await elevenRequest(
          primaryModel,
          isV3(primaryModel) && tag ? `${tag} ${spoken}` : spoken,
          settings
        );
        if (!elevenRes.ok && ELEVENLABS_FALLBACK_MODEL_ID !== primaryModel) {
          const errText = await elevenRes.text().catch(() => "");
          console.error("ElevenLabs primary model failed:", elevenRes.status, errText.slice(0, 200));
          // 4xx = model/plan problem, not transient → skip primary for a while
          if (!uzbek && elevenRes.status >= 400 && elevenRes.status < 500) {
            primaryDisabledUntil = Date.now() + 10 * 60 * 1000;
          }
          elevenRes = null;
        }
      }
      if (!elevenRes) {
        elevenRes = await elevenRequest(ELEVENLABS_FALLBACK_MODEL_ID, spoken, settings);
      }

      if (!elevenRes.ok) {
        const errText = await elevenRes.text().catch(() => "");
        console.error("ElevenLabs TTS error:", elevenRes.status, errText.slice(0, 300));
        return NextResponse.json({ error: "TTS unavailable" }, { status: 503 });
      }

      // Stream straight through — the client starts playing on the first chunk.
      return new Response(elevenRes.body, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const style = EMOTION_STYLE[emotion] || EMOTION_STYLE.neutral;
    const clean = text.replace(/\|\s*O'zbekcha:.*$/i, "").trim();
    const prompt = `Say naturally, ${style}: ${clean}`;

    const apiKey = process.env.GEMINI_API_KEY || "";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
            },
          },
        }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "TTS unavailable" }, { status: 503 });
    }

    const data = await res.json();
    const part = data?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string; mimeType?: string } }) => p.inlineData?.data);
    if (!part) {
      return NextResponse.json({ error: "No audio returned" }, { status: 503 });
    }

    const mime: string = part.inlineData.mimeType || "";
    const rateMatch = mime.match(/rate=(\d+)/);
    const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
    const pcm = base64ToBytes(part.inlineData.data);
    const wav = pcmToWav(pcm, sampleRate);

    return new Response(wav.buffer as ArrayBuffer, {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("TTS route error:", error);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
