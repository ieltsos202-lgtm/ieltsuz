import {
  ELEVENLABS_FALLBACK_MODEL_ID,
  ELEVENLABS_LATENCY_MODE,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_VOICE_ID,
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

function wsUrl(modelId: string): string {
  const params = new URLSearchParams({
    model_id: modelId,
    output_format: ELEVENLABS_OUTPUT_FORMAT,
    // Generate as soon as a chunk arrives — we already send whole sentences,
    // so ElevenLabs must not wait to fill its own buffer.
    auto_mode: "true",
    inactivity_timeout: "20",
  });
  if (!isV3(modelId)) params.set("optimize_streaming_latency", String(ELEVENLABS_LATENCY_MODE));
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
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("WebSocket failed to open"));
    };
    const cleanup = () => {
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

async function websocketStream(modelId: string, opts: TtsOptions): Promise<TtsStream> {
  const ws = await connect(wsUrl(modelId));
  let firstByte = false;
  let closed = false;

  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      ws.addEventListener("message", (ev: MessageEvent) => {
        try {
          const data = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
          if (!data) return;
          if (data.audio) {
            if (!firstByte) {
              firstByte = true;
              opts.onFirstByte?.();
            }
            controller.enqueue(base64ToBytes(data.audio));
          }
          if (data.isFinal) {
            if (!closed) {
              closed = true;
              controller.close();
            }
            try {
              ws.close();
            } catch {
              /* already closing */
            }
          }
          if (data.error) console.error("ElevenLabs WS error:", data.error);
        } catch {
          /* non-JSON frame */
        }
      });
      ws.addEventListener("close", () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
      ws.addEventListener("error", () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
    cancel() {
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
    })
  );

  return {
    transport: "websocket",
    push(text: string) {
      if (closed) return;
      const spoken = normalizeUzbekForTTS(text).trim();
      if (!spoken) return;
      try {
        ws.send(JSON.stringify({ text: `${spoken} ` }));
      } catch (e) {
        console.error("TTS ws send failed:", (e as Error)?.message);
      }
    },
    end() {
      if (closed) return;
      try {
        ws.send(JSON.stringify({ text: "" }));
      } catch {
        /* socket already gone; the reader will just see the close */
      }
    },
    cancel() {
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
  const queue: string[] = [];
  let finished = false;
  let cancelled = false;
  let firstByte = false;
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
          const res = await synthesize(modelId, next, opts);
          if (!res?.body) continue;
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
      const spoken = normalizeUzbekForTTS(text).trim();
      if (!spoken || cancelled) return;
      queue.push(spoken);
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
  if (!isV3(modelId)) body.optimize_streaming_latency = ELEVENLABS_LATENCY_MODE;

  const call = (id: string) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": API_KEY,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ ...body, model_id: id }),
    });

  let res = await call(modelId);
  if (!res.ok && ELEVENLABS_FALLBACK_MODEL_ID !== modelId) {
    console.error("ElevenLabs REST primary failed:", res.status);
    res = await call(ELEVENLABS_FALLBACK_MODEL_ID);
  }
  if (!res.ok) {
    console.error("ElevenLabs REST failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  return res;
}
