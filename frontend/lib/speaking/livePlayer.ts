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

/** Agent 3 (Analyst) output — arrives off-path, after the reply has started. */
export interface LiveTurnAnalysis {
  correction: { you_said: string; better: string; note: string } | null;
  vocab_tip: { instead_of: string; try: string; example: string } | null;
  pronunciation: { issue: string; how_to_say: string } | null;
}

/** Agent 4 (Scorer) output — per-turn band estimates for the running report. */
export interface LiveTurnEval {
  fluency: number | null;
  lexical: number | null;
  grammar: number | null;
  pronunciation: number | null;
  note: string;
}

export interface LiveTurnHandlers {
  /** The Ear's transcript — arrives BEFORE the examiner starts replying. */
  onTranscript?: (transcript: string) => void;
  /** Transcript + emotion, available before the first audio byte. */
  onMeta?: (meta: LiveTurnMeta) => void;
  /** Analyst's findings for this turn (correction / vocab / pronunciation). */
  onAnalysis?: (analysis: LiveTurnAnalysis) => void;
  /** Scorer's per-turn band estimates. */
  onEval?: (eval_: LiveTurnEval) => void;
  /** The stream finished without a single audio chunk (TTS outage) — the
   *  client can speak the reply with a fallback voice instead of going
   *  silent. When set, it replaces onPlaybackEnd for this case. */
  onNoAudio?: () => void;
  /** Each completed sentence of the reply, as it is synthesised. */
  onSentence?: (sentence: string) => void;
  /** Stream finished cleanly: full reply + the signed session token the
   *  client must echo on the next turn (20-minute session cap). */
  onDone?: (info: { reply: string; session: string }) => void;
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

  // WAV fallback mode: when ElevenLabs is down the server sends one complete
  // WAV file per sentence (Gemini TTS) instead of mp3 fragments. They are
  // queued and played back-to-back on the same element — no MediaSource.
  let wavMode = false;
  let wavStreamDone = false;
  let wavBusy = false;
  const wavQueue: Uint8Array[] = [];
  let wavUrl: string | null = null;

  let finishPlayback: () => void = () => {};
  const playbackDone = new Promise<void>((resolve) => {
    finishPlayback = () => {
      audio.removeEventListener("ended", onAudioEnded);
      audio.removeEventListener("error", finishPlayback);
      resolve();
    };
    const onAudioEnded = () => {
      if (wavMode) {
        playWavNext(); // chain the next sentence's WAV
        return;
      }
      finishPlayback();
    };
    audio.addEventListener("ended", onAudioEnded);
    audio.addEventListener("error", finishPlayback);
    signal?.addEventListener("abort", finishPlayback, { once: true });
  });

  const playWavNext = () => {
    const next = wavQueue.shift();
    if (!next) {
      wavBusy = false;
      if (wavStreamDone) finishPlayback();
      return;
    }
    wavBusy = true;
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(new Blob([next as BlobPart], { type: "audio/wav" }));
    audio.src = wavUrl;
    void audio.play().catch(() => playWavNext());
  };

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
      // Autoplay blocked or element failed — resolve instead of hanging the
      // turn on an "ended" event that will never come.
      finishPlayback();
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
          case "transcript":
            if (typeof ev.v === "string") handlers.onTranscript?.(ev.v);
            break;

          case "analysis":
            if (ev.v && typeof ev.v === "object") handlers.onAnalysis?.(ev.v as LiveTurnAnalysis);
            break;

          case "eval":
            if (ev.v && typeof ev.v === "object") handlers.onEval?.(ev.v as LiveTurnEval);
            break;

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
            const isWav =
              bytes.length > 4 &&
              bytes[0] === 0x52 && // R
              bytes[1] === 0x49 && // I
              bytes[2] === 0x46 && // F
              bytes[3] === 0x46; //   F
            if (!sawAudio) {
              sawAudio = true;
              clientTiming.first_audio_ms = Math.round(performance.now() - t0);
              wavMode = isWav;
              if (wavMode && objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = null;
              }
            }
            if (wavMode) {
              if (!isWav) break; // stray mp3 fragment — drop, keep order
              wavQueue.push(bytes);
              if (!startedPlaying) {
                startedPlaying = true;
                clientTiming.playback_start_ms = Math.round(performance.now() - t0);
                handlers.onPlaybackStart?.();
              }
              if (!wavBusy) playWavNext();
            } else if (isWav) {
              break; // WAV mid-mp3-stream would corrupt the buffer
            } else if (useMse) {
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
            handlers.onDone?.({
              reply: typeof ev.reply === "string" ? ev.reply : "",
              session: typeof ev.session === "string" ? ev.session : "",
            });
            break;

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
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    return;
  }

  if (useMse && !wavMode) {
    sink.queue?.end();
  } else if (!useMse && !wavMode && fallbackChunks.length) {
    const blob = new Blob(fallbackChunks as BlobPart[], { type: MIME });
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    startPlayback();
  }

  wavStreamDone = true;
  handlers.onTiming?.({ ...serverTiming, ...clientTiming });

  if (!sawAudio) {
    // TTS produced nothing (quota/outage) — let the client speak the reply
    // with a fallback voice; without a handler we just end the turn.
    if (handlers.onNoAudio) handlers.onNoAudio();
    else handlers.onPlaybackEnd?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return;
  }

  if (wavMode && !wavBusy) finishPlayback(); // queue already drained

  await playbackDone;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (wavUrl) URL.revokeObjectURL(wavUrl);
  handlers.onPlaybackEnd?.();
}
