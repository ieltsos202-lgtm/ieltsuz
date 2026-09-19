import { geminiKeys } from "@/lib/gemini";
import {
  ELEVENLABS_FALLBACK_MODEL_ID,
  ELEVENLABS_LATENCY_MODE,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_UZBEK_MODEL_ID,
  ELEVENLABS_VOICE_ID,
  isProbablyUzbek,
  isV3,
  normalizeUzbekForTTS,
  voiceSettingsFor,
} from "@/lib/speaking/voice";

/**
 * Streaming TTS.
 *
 * Primary transport is the ElevenLabs WebSocket ("stream-input"), which keeps a
 * single synthesis context open for the whole reply: sentence 2 is synthesised
 * while sentence 1 is already playing, and the voice keeps its prosody across
 * the boundary instead of restarting per request.
 *
 * If the socket cannot be opened (runtime without outbound WS, blocked
 * network, account restriction) we transparently degrade to one REST call per
 * sentence. That is slightly slower and less smooth, but never breaks a live
 * session.
 */

const API_KEY = process.env.ELEVENLABS_API_KEY || "";

export interface TtsStream {
  /** Queue a finished sentence for synthesis. */
  push(text: string): void;
  /** No more text will arrive. */
  end(): void;
  /** mp3 chunks, in order. */
  audio: ReadableStream<Uint8Array>;
  /** Abort everything immediately (barge-in / client disconnect). */
  cancel(): void;
  readonly transport: "websocket" | "rest";
}

export interface TtsOptions {
  mode: "exam" | "chat";
  emotion: string;
  modelId?: string;
  onFirstByte?: () => void;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Wrap raw PCM16 samples in a WAV header so the browser can play them. */
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

const GEMINI_TTS_MODEL = process.env.TTS_MODEL || "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = process.env.TTS_VOICE || "Aoede";

/**
 * Last-resort voice: the Gemini TTS model runs on the same keys as the
 * examiner, so it keeps working when the ElevenLabs key is dead or the
 * account is out of quota. Returns one complete WAV file per call — the
 * client detects the RIFF header and plays these back-to-back.
 */
async function geminiTts(text: string): Promise<Uint8Array | null> {
  for (const apiKey of geminiKeys()) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A hung TTS request must not freeze the whole turn.
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Say naturally: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
            },
          },
        }),
      }
    ).catch(() => null);
    if (!res) continue;
    if (!res.ok) {
      // 429/5xx — try the next key; other 4xx won't be fixed by another key.
      if (res.status !== 429 && res.status < 500) break;
      continue;
    }
    const data = await res.json().catch(() => null);
    const part = data?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data
    );
    if (!part) return null;
    const mime: string = part.inlineData.mimeType || "";
    const sampleRate = parseInt(mime.match(/rate=(\d+)/)?.[1] || "24000");
    return pcmToWav(base64ToBytes(part.inlineData.data), sampleRate);
  }
  return null;
}

function wsUrl(modelId: string): string {
  const params = new URLSearchParams({
    model_id: modelId,
    output_format: ELEVENLABS_OUTPUT_FORMAT,
    inactivity_timeout: "20",
  });
  // Latency trimming costs quality — only worth it on turbo/flash.
  if (!isV3(modelId)) {
    params.set(
      "optimize_streaming_latency",
      String(/turbo|flash/.test(modelId) ? ELEVENLABS_LATENCY_MODE : 0)
    );
  }
  return `wss://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream-input?${params.toString()}`;
}

/**
 * Open an outbound WebSocket. Workers exposes it on the fetch response
 * (`Upgrade: websocket`); Node/browsers use the standard constructor. Trying
 * both keeps `next dev` and the deployed Worker on the same code path.
 */
async function connect(url: string): Promise<WebSocket> {
  try {
    const res = await fetch(url.replace(/^wss:/, "https:"), {
      headers: { Upgrade: "websocket" },
    });
    const ws = (res as unknown as { webSocket?: WebSocket & { accept?: () => void } }).webSocket;
    if (ws) {
      ws.accept?.();
      return ws;
    }
  } catch {
    // Runtime without fetch-upgrade support — fall through.
  }

  if (typeof WebSocket === "undefined") throw new Error("No WebSocket support");
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    // A socket that neither opens nor errors would hang the turn forever —
    // time out and let the caller degrade to REST.
    const timer = setTimeout(() => {
      cleanup();
      try {
        ws.close();
      } catch {
        /* noop */
      }
      reject(new Error("WebSocket open timeout"));
    }, 8000);
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("WebSocket failed to open"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
  });
  return ws;
}

export async function openTtsStream(opts: TtsOptions): Promise<TtsStream> {
  if (!API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");
  const modelId = opts.modelId || ELEVENLABS_MODEL_ID;

  try {
    return await websocketStream(modelId, opts);
  } catch (e) {
    console.error("TTS websocket unavailable, using REST per sentence:", (e as Error)?.message);
    return restStream(modelId, opts);
  }
}

interface Seg {
  text: string;
  uzbek: boolean;
}

/**
 * English sentences stream through the turbo WebSocket; Uzbek sentences are
 * synthesised per-sentence over REST with the multilingual model, which
 * actually pronounces Uzbek correctly. Segments are consumed strictly in
 * order — an English segment ends when ElevenLabs answers our `flush` with
 * `isFinal`, so REST audio can never overtake earlier WS audio.
 */
async function websocketStream(modelId: string, opts: TtsOptions): Promise<TtsStream> {
  const ws = await connect(wsUrl(modelId));
  let firstByte = false;
  let closed = false;
  let cancelled = false;
  let finished = false;
  let notify: (() => void) | null = null;
  // Set only while an English segment is being generated — stray WS audio
  // outside that window is dropped rather than played out of order.
  let acceptingWsAudio = false;
  let segmentDone: (() => void) | null = null;
  // If the first flush never yields isFinal we stop waiting on it and revert
  // to fire-and-forget for English (the pre-routing behaviour).
  let wsFinalSeen = false;
  let wsNoFinal = false;
  // Once a sentence falls back to Gemini TTS (WAV) the whole turn stays on
  // it — mp3 and wav bytes must never mix in one audio stream.
  let wavMode = false;

  const queue: Seg[] = [];
  const wake = () => {
    notify?.();
    notify = null;
  };

  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      ws.addEventListener("message", (ev: MessageEvent) => {
        try {
          const data = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
          if (!data) return;
          if (data.audio && acceptingWsAudio) {
            if (!firstByte) {
              firstByte = true;
              opts.onFirstByte?.();
            }
            controller.enqueue(base64ToBytes(data.audio));
          }
          if (data.isFinal) {
            wsFinalSeen = true;
            segmentDone?.();
            segmentDone = null;
          }
          if (data.error) console.error("ElevenLabs WS error:", data.error);
        } catch {
          /* non-JSON frame */
        }
      });
      ws.addEventListener("close", () => {
        segmentDone?.();
        wake();
      });
      ws.addEventListener("error", () => {
        segmentDone?.();
        wake();
      });

      (async () => {
        try {
          for (;;) {
            if (cancelled) break;
            const seg = queue.shift();
            if (!seg) {
              if (finished) break;
              await new Promise<void>((r) => (notify = r));
              continue;
            }
            if (seg.uzbek || wsNoFinal || wavMode || ws.readyState !== 1) {
              // Uzbek always goes through the multilingual REST model. A dead
              // socket (auth failure) or a spent ElevenLabs key lands here
              // too — and if REST also fails, Gemini TTS keeps the voice alive.
              const res = wavMode
                ? null
                : await synthesize(
                    seg.uzbek ? ELEVENLABS_UZBEK_MODEL_ID : modelId,
                    seg.text,
                    opts
                  );
              if (res?.body) {
                const reader = res.body.getReader();
                for (;;) {
                  const { value, done } = await reader.read();
                  if (done || cancelled) break;
                  if (value) {
                    if (!firstByte) {
                      firstByte = true;
                      opts.onFirstByte?.();
                    }
                    controller.enqueue(value);
                  }
                }
                reader.releaseLock();
              } else {
                const wav = await geminiTts(seg.text);
                if (wav) {
                  wavMode = true;
                  if (!firstByte) {
                    firstByte = true;
                    opts.onFirstByte?.();
                  }
                  controller.enqueue(wav);
                }
              }
            } else {
              acceptingWsAudio = true;
              try {
                ws.send(JSON.stringify({ text: `${seg.text} `, flush: true }));
              } catch {
                /* socket gone */
              }
              const timedOut = await Promise.race([
                new Promise<false>((r) => (segmentDone = () => r(false))),
                new Promise<true>((r) => setTimeout(() => r(true), wsFinalSeen ? 15000 : 8000)),
              ]);
              if (timedOut && !wsFinalSeen) wsNoFinal = true;
              segmentDone = null;
              acceptingWsAudio = false;
            }
          }
        } catch (e) {
          console.error("TTS ws pipeline failed:", (e as Error)?.message);
        } finally {
          try {
            ws.send(JSON.stringify({ text: "" }));
          } catch {
            /* noop */
          }
          try {
            ws.close();
          } catch {
            /* noop */
          }
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
      closed = true;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    },
  });

  ws.send(
    JSON.stringify({
      text: " ",
      voice_settings: voiceSettingsFor(opts.mode, opts.emotion, modelId),
      xi_api_key: API_KEY,
      // Never auto-generate: audio is produced only when we send flush, so
      // isFinal marks exactly one of our segments — no mid-sentence cutoffs.
      generation_config: { chunk_length_schedule: [9999, 9999, 9999, 9999] },
    })
  );

  return {
    transport: "websocket",
    push(text: string) {
      if (closed || cancelled) return;
      const uzbek = isProbablyUzbek(text);
      const spoken = normalizeUzbekForTTS(text, uzbek).trim();
      if (!spoken) return;
      queue.push({ text: spoken, uzbek });
      wake();
    },
    end() {
      finished = true;
      wake();
    },
    cancel() {
      cancelled = true;
      closed = true;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    },
    audio,
  };
}

/** One REST request per sentence, played back in order. */
function restStream(modelId: string, opts: TtsOptions): TtsStream {
  const queue: Seg[] = [];
  let finished = false;
  let cancelled = false;
  let firstByte = false;
  let wavMode = false;
  let notify: (() => void) | null = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  const audio = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (;;) {
          if (cancelled) break;
          const next = queue.shift();
          if (next === undefined) {
            if (finished) break;
            await new Promise<void>((r) => (notify = r));
            continue;
          }
          const res = wavMode
            ? null
            : await synthesize(next.uzbek ? ELEVENLABS_UZBEK_MODEL_ID : modelId, next.text, opts);
          if (!res?.body) {
            // ElevenLabs failed (dead key / quota) — Gemini TTS fallback.
            const wav = await geminiTts(next.text);
            if (wav) {
              wavMode = true;
              if (!firstByte) {
                firstByte = true;
                opts.onFirstByte?.();
              }
              controller.enqueue(wav);
            }
            continue;
          }
          const reader = res.body.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done || cancelled) break;
            if (value) {
              if (!firstByte) {
                firstByte = true;
                opts.onFirstByte?.();
              }
              controller.enqueue(value);
            }
          }
          reader.releaseLock();
        }
      } catch (e) {
        console.error("REST TTS stream failed:", (e as Error)?.message);
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancelled = true;
      wake();
    },
  });

  return {
    transport: "rest",
    push(text: string) {
      const uzbek = isProbablyUzbek(text);
      const spoken = normalizeUzbekForTTS(text, uzbek).trim();
      if (!spoken || cancelled) return;
      queue.push({ text: spoken, uzbek });
      wake();
    },
    end() {
      finished = true;
      wake();
    },
    cancel() {
      cancelled = true;
      wake();
    },
    audio,
  };
}

async function synthesize(
  modelId: string,
  text: string,
  opts: TtsOptions
): Promise<Response | null> {
  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    voice_settings: voiceSettingsFor(opts.mode, opts.emotion, modelId),
    output_format: ELEVENLABS_OUTPUT_FORMAT,
  };
  // Latency trimming costs quality — only worth it on turbo/flash. The
  // multilingual model runs at full quality (0).
  if (!isV3(modelId)) {
    body.optimize_streaming_latency = /turbo|flash/.test(modelId) ? ELEVENLABS_LATENCY_MODE : 0;
  }

  const call = (id: string) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": API_KEY,
        Accept: "audio/mpeg",
      },
      // A hung request must not freeze the turn — fall through to the next
      // provider instead.
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ ...body, model_id: id }),
    }).catch(() => null);

  let res = await call(modelId);
  if (res && !res.ok && ELEVENLABS_FALLBACK_MODEL_ID !== modelId) {
    console.error("ElevenLabs REST primary failed:", res.status);
    res = await call(ELEVENLABS_FALLBACK_MODEL_ID);
  } else if (!res) {
    res = await call(ELEVENLABS_FALLBACK_MODEL_ID);
  }
  if (!res || !res.ok) {
    console.error("ElevenLabs REST failed:", res?.status, res ? (await res.text().catch(() => "")).slice(0, 200) : "no response");
    return null;
  }
  return res;
}
