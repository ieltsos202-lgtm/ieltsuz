/**
 * AudioWorklet processor for the Gemini Live session.
 *
 * Receives Float32 mic frames at the AudioContext's native rate, converts to
 * 16-bit PCM and posts { pcm: Int16Array, rms: number } to the main thread.
 * Resampling to 16kHz happens on the main thread (the context is created with
 * sampleRate:16000 where supported, so usually this is a no-op).
 *
 * Frames arrive every 128 samples (~8ms @16kHz). Posting each one floods the
 * WebSocket with ~125 msgs/sec and gives the server VAD a jittery signal, so
 * we accumulate ~100ms per message instead.
 */
// ~100ms at whatever rate the context actually runs at (sampleRate is a
// worklet-global; browsers may ignore our requested 16kHz).
const BATCH_SAMPLES = Math.max(1600, Math.round(sampleRate * 0.1));

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(BATCH_SAMPLES);
    this.len = 0;
    this.sumSq = 0;
    this.count = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.sumSq += s * s;
      this.count++;
      if (this.len >= BATCH_SAMPLES) this.flush();
    }
    return true;
  }

  flush() {
    const pcm = this.buf.slice(0, this.len);
    const rms = Math.sqrt(this.sumSq / Math.max(1, this.count));
    this.port.postMessage({ pcm, rms }, [pcm.buffer]);
    this.len = 0;
    this.sumSq = 0;
    this.count = 0;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
