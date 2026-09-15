/**
 * Shared voice configuration for the speaking examiner.
 * Used by both the legacy REST TTS route and the streaming live pipeline, so
 * the examiner sounds identical whichever path serves a turn.
 */

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
// turbo v2.5: ~250ms first byte. flash v2.5: ~75ms, slightly flatter delivery.
export const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
export const ELEVENLABS_FALLBACK_MODEL_ID =
  process.env.ELEVENLABS_FALLBACK_MODEL_ID || "eleven_flash_v2_5";
export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
// 0 = best quality, 4 = lowest latency. 3 trims ~120ms with no audible cost on
// a conversational voice.
export const ELEVENLABS_LATENCY_MODE = 3;

// Chat mode: expressive, human, emotional — lower stability = more variation.
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

// Exam mode: calm, professional, real examiner — higher stability.
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

export function isV3(modelId: string) {
  return modelId.startsWith("eleven_v3");
}

export function isFast(modelId: string) {
  return /turbo|flash/.test(modelId);
}

/** Emotion + mode -> ElevenLabs voice settings, adjusted for the model. */
export function voiceSettingsFor(
  mode: "exam" | "chat",
  emotion: string,
  modelId: string
): VoiceSettings {
  const map = mode === "exam" ? EXAM_VOICE : CHAT_VOICE;
  const s = map[emotion] || map.neutral;
  if (isV3(modelId)) {
    // v3 only accepts stability 0 (creative) / 0.5 (natural) / 1 (robust).
    const stability = s.stability < 0.33 ? 0 : s.stability < 0.75 ? 0.5 : 1;
    return { ...s, stability };
  }
  // On turbo/flash, style exaggeration and speaker boost both add latency.
  if (isFast(modelId)) {
    return { ...s, style: Math.min(s.style, 0.3), use_speaker_boost: false };
  }
  return s;
}

/**
 * Uzbek Latin uses apostrophes (o', g') that TTS engines read as glottal stops
 * or pauses. Normalising them (and x → h) gives a much more natural reading.
 */
export function normalizeUzbekForTTS(text: string): string {
  return text
    .replace(/([oOgG])[\u2018\u2019\u02BB\u02BC'`\u00B4]/g, "$1")
    .replace(/(^|[^a-zA-Z])x([a-z])/g, "$1h$2")
    .replace(/(^|[^a-zA-Z])X([a-z])/g, "$1H$2");
}
