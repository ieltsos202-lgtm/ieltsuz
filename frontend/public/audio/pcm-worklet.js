/**
 * AudioWorklet processor for the Gemini Live session.
 *
 * Receives Float32 mic frames at the AudioContext's native rate, converts to
 * 16-bit PCM and posts { pcm: Int16Array, rms: number } to the main thread.
 * Resampling to 16kHz happens on the main thread (the context is created with
 * sampleRate:16000 where supported, so usually this is a no-op).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const ch = input[0];
    const pcm = new Int16Array(ch.length);
    let sum = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / ch.length);
    this.port.postMessage({ pcm, rms }, [pcm.buffer]);
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
