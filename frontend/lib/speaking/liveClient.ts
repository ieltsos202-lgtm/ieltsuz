"use client";

/**
 * Gemini Live API client — one bidirectional WebSocket for the whole session.
 *
 *   mic → AudioWorklet → PCM16 @16kHz → realtimeInput.audio → Gemini
 *   Gemini → serverContent.modelTurn (PCM @24kHz) → scheduled playback
 *
 * The API's automatic VAD handles turn-taking and barge-in: when the user
 * starts speaking mid-reply the server sends `interrupted` and we flush the
 * playback queue. Both sides are transcribed server-side
 * (inputAudioTranscription / outputAudioTranscription).
 */

export interface LiveSessionHandlers {
  /** Model audio chunk (PCM16 @24kHz) — schedule for playback. */
  onAudio?: (pcm: Int16Array) => void;
  /** Incremental transcript of the USER's speech. */
  onInputTranscript?: (text: string) => void;
  /** Incremental transcript of the MODEL's speech. */
  onOutputTranscript?: (text: string) => void;
  /** Model finished its turn. */
  onTurnComplete?: () => void;
  /** User barged in — flush playback immediately. */
  onInterrupted?: () => void;
  /** Socket closed (cleanly or not). `graceful` = we called close(). */
  onClose?: (graceful: boolean, reason: string) => void;
  /** First audio byte arrived — latency metric. */
  onFirstAudio?: (ms: number) => void;
}

const WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private t0 = 0;
  private firstAudioSent = false;
  private graceful = false;

  private constructor(
    private readonly handlers: LiveSessionHandlers
  ) {}

  /**
   * Open the socket and complete the Live handshake.
   *
   * An ephemeral auth token is ONLY accepted as `access_token` on the
   * Constrained endpoint. The other combinations fail hard:
   *   ?key=<token>                     → 1007 "API key not valid"
   *   BidiGenerateContent + token      → 1008 "unregistered callers"
   */
  static async connect(
    token: string,
    model: string,
    sessionConfig: Record<string, unknown>,
    handlers: LiveSessionHandlers
  ): Promise<GeminiLiveSession> {
    const session = new GeminiLiveSession(handlers);
    const setup = JSON.stringify({
      setup: { model: `models/${model}`, ...sessionConfig },
    });
    await session.open(
      `${WS_BASE}.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`,
      setup
    );
    return session;
  }

  private open(url: string, setupMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      this.t0 = performance.now();
      let settled = false;

      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* noop */ }
        reject(new Error(msg));
      };

      const timeout = setTimeout(() => fail("Live API handshake timed out"), 12000);

      ws.onopen = () => {
        ws.send(setupMessage);
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(typeof event.data === "string" ? event.data : "");
        } catch {
          return;
        }
        if (msg?.setupComplete !== undefined) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
          return;
        }
        if (!settled) return; // ignore anything before setupComplete
        this.handleMessage(msg);
      };

      ws.onerror = () => fail("Live API socket error");
      ws.onclose = (ev) => {
        clearTimeout(timeout);
        if (!settled) {
          fail(`Live API closed during setup (${ev.code})`);
          return;
        }
        this.ws = null;
        this.handlers.onClose?.(this.graceful, ev.reason || `code ${ev.code}`);
      };
    });
  }

  private handleMessage(msg: any) {
    const sc = msg?.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.handlers.onInterrupted?.();
      return;
    }

    const parts = sc.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        const b64 = p?.inlineData?.data;
        if (typeof b64 === "string" && b64) {
          if (!this.firstAudioSent) {
            this.firstAudioSent = true;
            this.handlers.onFirstAudio?.(Math.round(performance.now() - this.t0));
          }
          const bytes = base64ToBytes(b64);
          this.handlers.onAudio?.(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1));
        }
      }
    }

    const inText = sc.inputTranscription?.text;
    if (typeof inText === "string" && inText) this.handlers.onInputTranscript?.(inText);

    const outText = sc.outputTranscription?.text;
    if (typeof outText === "string" && outText) this.handlers.onOutputTranscript?.(outText);

    if (sc.turnComplete) this.handlers.onTurnComplete?.();
  }

  /** Stream one mic chunk. `pcm` is 16-bit PCM at 16kHz mono. */
  sendAudio(pcm: Int16Array) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || pcm.length === 0) return;
    ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      })
    );
  }

  /** Optional text nudge (e.g. kick off the greeting). */
  sendText(text: string) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        },
      })
    );
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    this.graceful = true;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}

/**
 * Scheduled PCM playback at 24kHz. Chunks are appended back-to-back on a
 * running timeline; reset() flushes everything (barge-in).
 */
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStart = 0;
  private playing = 0;
  private onEmpty: (() => void) | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ sampleRate: 24000 });
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Called when the playback queue drains to silence. */
  setOnEmpty(cb: (() => void) | null) {
    this.onEmpty = cb;
  }

  get isPlaying() {
    return this.playing > 0;
  }

  push(pcm: Int16Array) {
    if (pcm.length === 0) return;
    const ctx = this.ensureCtx();
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const start = Math.max(now + 0.02, this.nextStart);
    src.start(start);
    this.nextStart = start + buf.duration;
    this.playing++;
    src.onended = () => {
      this.playing--;
      if (this.playing <= 0) {
        this.playing = 0;
        this.onEmpty?.();
      }
    };
  }

  /** Barge-in: drop everything queued/playing. */
  reset() {
    if (this.ctx) {
      try { void this.ctx.close(); } catch { /* noop */ }
    }
    this.ctx = null;
    this.nextStart = 0;
    this.playing = 0;
  }

  dispose() {
    this.reset();
    this.onEmpty = null;
  }
}

/** Downsample Int16 PCM to 16kHz with linear interpolation (no-op if already 16k). */
export function resampleTo16k(pcm: Int16Array, fromRate: number): Int16Array {
  if (fromRate === 16000) return pcm;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = pos - i0;
    out[i] = Math.round(pcm[i0] * (1 - frac) + pcm[i1] * frac);
  }
  return out;
}
