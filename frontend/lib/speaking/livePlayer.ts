"use client";

/**
 * Client half of the live pipeline.
 *
 * Consumes the NDJSON event stream from /api/speaking/live and feeds the mp3
 * chunks into a MediaSource buffer, so playback starts on the first chunk of
 * the first sentence instead of waiting for the whole answer. Chunks are
 * appended through a queue, which is what keeps sentence boundaries seamless —
 * appendBuffer can only run when the SourceBuffer is idle.
 *
 * Where MediaSource is unavailable (older iOS Safari), it degrades to
 * buffering the whole reply and playing it as a Blob.
 */

export interface LiveCueCard {
  topic: string;
  bullets: string[];
}

export interface LiveTurnMeta {
  transcript: string;
  emotion: string;
  cue_card: LiveCueCard | null;
}

export interface LiveTurnHandlers {
  /** Transcript + emotion, available before the first audio byte. */
  onMeta?: (meta: LiveTurnMeta) => void;
  /** Each completed sentence of the reply, as it is synthesised. */
  onSentence?: (sentence: string) => void;
  /** Audio actually started coming out of the speaker. */
  onPlaybackStart?: () => void;
  /** Playback finished (or nothing was played). */
  onPlaybackEnd?: () => void;
  onError?: (message: string) => void;
  /** Server-side + client-side latency breakdown, for debugging. */
  onTiming?: (timing: Record<string, number>) => void;
}

const MIME = "audio/mpeg";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function canUseMediaSource(): boolean {
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(MIME);
}

/** Serialised appendBuffer queue for one SourceBuffer. */
class BufferQueue {
  private queue: Uint8Array[] = [];
  private appending = false;
  private ended = false;

  constructor(
    private readonly sb: SourceBuffer,
    private readonly ms: MediaSource
  ) {
    sb.addEventListener("updateend", () => {
      this.appending = false;
      this.drain();
    });
  }

  push(chunk: Uint8Array) {
    this.queue.push(chunk);
    this.drain();
  }

  end() {
    this.ended = true;
    this.drain();
  }

  private drain() {
    if (this.appending || this.sb.updating) return;
    const next = this.queue.shift();
    if (next) {
      this.appending = true;
      try {
        this.sb.appendBuffer(next as unknown as BufferSource);
      } catch {
        this.appending = false;
      }
      return;
    }
    if (this.ended && this.ms.readyState === "open") {
      try {
        this.ms.endOfStream();
      } catch {
        /* already ended */
      }
    }
  }
}

/**
 * Play one streamed turn. Resolves when playback has finished (or immediately
 * on error/abort). `audio` is reused across turns so a single element keeps the
 * browser's autoplay permission.
 */
export async function playLiveTurn(
  res: Response,
  audio: HTMLAudioElement,
  handlers: LiveTurnHandlers,
  signal?: AbortSignal
): Promise<void> {
  if (!res.body) {
    handlers.onError?.("Javob oqimi bo'sh.");
    return;
  }

  const t0 = performance.now();
  const clientTiming: Record<string, number> = {};
  let serverTiming: Record<string, number> = {};
  let startedPlaying = false;
  let sawAudio = false;
  let objectUrl: string | null = null;

  const fallbackChunks: Uint8Array[] = [];
  const useMse = canUseMediaSource();

  // A holder keeps the queue assignable from the sourceopen closure without
  // TypeScript narrowing it to `never` at the call sites below.
  const sink: { queue: BufferQueue | null } = { queue: null };
  let sourceReady: Promise<void> = Promise.resolve();

  const playbackDone = new Promise<void>((resolve) => {
    const finish = () => {
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      resolve();
    };
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", finish);
    signal?.addEventListener("abort", finish, { once: true });
  });

  if (useMse) {
    const ms = new MediaSource();
    objectUrl = URL.createObjectURL(ms);
    audio.src = objectUrl;
    sourceReady = new Promise<void>((resolve) => {
      ms.addEventListener(
        "sourceopen",
        () => {
          try {
            sink.queue = new BufferQueue(ms.addSourceBuffer(MIME), ms);
          } catch {
            sink.queue = null;
          }
          resolve();
        },
        { once: true }
      );
    });
  }

  const startPlayback = () => {
    if (startedPlaying) return;
    startedPlaying = true;
    clientTiming.playback_start_ms = Math.round(performance.now() - t0);
    handlers.onPlaybackStart?.();
    void audio.play().catch(() => {
      /* autoplay blocked — the UI offers a resume button */
    });
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;

        let ev: any;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }

        switch (ev.t) {
          case "meta":
            clientTiming.meta_ms = Math.round(performance.now() - t0);
            handlers.onMeta?.({
              transcript: typeof ev.transcript === "string" ? ev.transcript : "",
              emotion: typeof ev.emotion === "string" ? ev.emotion : "neutral",
              cue_card: ev.cue_card ?? null,
            });
            break;

          case "text":
            if (typeof ev.v === "string") handlers.onSentence?.(ev.v);
            break;

          case "audio": {
            if (typeof ev.v !== "string") break;
            const bytes = base64ToBytes(ev.v);
            if (!sawAudio) {
              sawAudio = true;
              clientTiming.first_audio_ms = Math.round(performance.now() - t0);
            }
            if (useMse) {
              await sourceReady;
              sink.queue?.push(bytes);
              startPlayback();
            } else {
              fallbackChunks.push(bytes);
            }
            break;
          }

          case "timing":
            if (ev.v && typeof ev.v === "object") serverTiming = ev.v;
            break;

          case "error":
            handlers.onError?.(typeof ev.v === "string" ? ev.v : "Xatolik yuz berdi.");
            break;

          case "done":
          default:
            break;
        }
      }
    }
  } catch (e) {
    if (!signal?.aborted) handlers.onError?.((e as Error)?.message || "Oqim uzildi.");
  } finally {
    reader.releaseLock();
  }

  if (signal?.aborted) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return;
  }

  if (useMse) {
    sink.queue?.end();
  } else if (fallbackChunks.length) {
    const blob = new Blob(fallbackChunks as BlobPart[], { type: MIME });
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    startPlayback();
  }

  handlers.onTiming?.({ ...serverTiming, ...clientTiming });

  if (!sawAudio) {
    handlers.onPlaybackEnd?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return;
  }

  await playbackDone;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  handlers.onPlaybackEnd?.();
}
