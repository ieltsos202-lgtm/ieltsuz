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
  /** Server is about to terminate this session — reconnect now, not on close. */
  onGoAway?: (timeLeftMs: number) => void;
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
  private resumptionHandle = "";

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
    handlers: LiveSessionHandlers,
    /** Rejoin a dropped session instead of starting a new conversation. */
    resumeHandle?: string
  ): Promise<GeminiLiveSession> {
    const session = new GeminiLiveSession(handlers);
    const setup = JSON.stringify({
      setup: {
        model: `models/${model}`,
        ...sessionConfig,
        ...(resumeHandle ? { sessionResumption: { handle: resumeHandle } } : {}),
      },
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
      // The Live API sends EVERYTHING (setupComplete, audio, transcripts) as
      // binary frames. With the default "blob" type, event.data is a Blob —
      // JSON.parse("") throws, setupComplete is never seen, the handshake
      // times out and the session silently falls back to the slow pipeline.
      ws.binaryType = "arraybuffer";
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
          const raw =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          msg = JSON.parse(raw);
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
    // Latest resumption handle; the socket can die at any moment, so keep it.
    const handle = msg?.sessionResumptionUpdate;
    if (handle?.resumable && typeof handle.newHandle === "string") {
      this.resumptionHandle = handle.newHandle;
    }
    if (msg?.goAway) {
      const left = String(msg.goAway.timeLeft || "");
      const secs = Number(left.replace(/s$/, "")) || 0;
      this.handlers.onGoAway?.(Math.max(0, secs * 1000));
      return;
    }

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

  /** Token that lets a fresh socket continue this same conversation. */
  get resumeHandle() {
    return this.resumptionHandle;
  }

  close() {
    this.graceful = true;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}

/**
 * Scheduled PCM playback at 24kHz.
 *
 * Two things matter for the examiner to sound like a person rather than a
 * stuttering radio:
 *
 * 1. ONE AudioContext for the whole session. Closing and rebuilding it on
 *    every barge-in used to cost 50-200ms of cold start before the next reply
 *    could be heard, and Chrome caps a page at ~6 concurrent contexts — after a
 *    handful of interruptions `new AudioContext()` simply failed and the
 *    examiner went permanently silent. Flushing now means stopping the sources,
 *    not destroying the device.
 *
 * 2. A real jitter buffer. Chunks arrive over a WebSocket, so their spacing is
 *    not the spacing they must be played at. Scheduling the first chunk of a
 *    turn only 20ms ahead meant any network hiccup landed past its slot and
 *    produced an audible gap mid-word. We give the first chunk a LEAD and then
 *    append back-to-back; if the queue ever underruns we re-lead instead of
 *    stacking late buffers on top of each other.
 */
const JITTER_LEAD_S = 0.12;

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private playing = 0;
  private onEmpty: (() => void) | null = null;
  private generation = 0;

  private ensureCtx(): { ctx: AudioContext; bus: GainNode } {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ sampleRate: 24000, latencyHint: "interactive" });
      this.bus = this.ctx.createGain();
      this.bus.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return { ctx: this.ctx, bus: this.bus! };
  }

  /** Pre-open the audio device so the first reply is not paying for it. */
  warmup() {
    this.ensureCtx();
  }

  /** Called when the playback queue drains to silence. */
  setOnEmpty(cb: (() => void) | null) {
    this.onEmpty = cb;
  }

  get isPlaying() {
    return this.playing > 0;
  }

  /** Seconds of audio still queued ahead of the play head. */
  get bufferedSeconds() {
    if (!this.ctx) return 0;
    return Math.max(0, this.nextStart - this.ctx.currentTime);
  }

  push(pcm: Int16Array) {
    if (pcm.length === 0) return;
    const { ctx, bus } = this.ensureCtx();
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(bus);

    // Start of a turn, or the queue underran while chunks were in flight:
    // give the stream a fresh lead so playback is continuous from here.
    const now = ctx.currentTime;
    const start = this.nextStart > now ? this.nextStart : now + JITTER_LEAD_S;
    src.start(start);
    this.nextStart = start + buf.duration;

    this.playing++;
    this.sources.add(src);
    const gen = this.generation;
    src.onended = () => {
      this.sources.delete(src);
      if (gen !== this.generation) return; // flushed — its slot is gone
      this.playing--;
      if (this.playing <= 0) {
        this.playing = 0;
        this.onEmpty?.();
      }
    };
  }

  /** Barge-in: drop everything queued/playing, keep the audio device open. */
  reset() {
    this.generation++;
    this.sources.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        /* already finished */
      }
    });
    this.sources.clear();
    this.playing = 0;
    this.nextStart = 0;
  }

  dispose() {
    this.reset();
    this.onEmpty = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.bus = null;
    if (ctx) {
      try { void ctx.close(); } catch { /* noop */ }
    }
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

/**
 * Concatenate captured PCM16 mic chunks into one mono WAV Blob (16kHz).
 * In live mode there are no per-turn audio blobs — the examiner hears the
 * socket directly — so the candidate's gated speech is accumulated here and
 * uploaded with the end-of-test report for real pronunciation assessment.
 */
export function pcmChunksToWavBlob(chunks: Int16Array[], sampleRate = 16000): Blob | null {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total === 0) return null;
  const data = new Int16Array(total);
  let off = 0;
  for (const c of chunks) {
    data.set(c, off);
    off += c.length;
  }
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const wstr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM format
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  wstr(36, "data");
  v.setUint32(40, data.length * 2, true);
  new Int16Array(buf, 44).set(data);
  return new Blob([buf], { type: "audio/wav" });
}
