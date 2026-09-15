/**
 * Incremental sentence splitter for a token stream.
 *
 * The whole point of the streaming pipeline is that TTS starts on sentence 1
 * while the model is still writing sentence 2. That only works if we can cut
 * the stream at a *safe* boundary: cutting mid-clause makes ElevenLabs choose
 * the wrong intonation, and cutting after "Mr." or "7.5" splits a word.
 */

const ABBREVIATIONS = [
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "no",
];

/** Minimum characters before we are willing to emit — very short fragments
 * ("Right.") are cheap to synthesise but sound clipped when isolated. */
const MIN_CHUNK = 24;
/** Emit at a comma/clause break if the buffer grows past this without a full
 * stop, so a long rambling sentence still starts playing quickly. */
const SOFT_LIMIT = 140;

function endsWithAbbreviation(text: string): boolean {
  const m = text.match(/([A-Za-z.]+)\.$/);
  if (!m) return false;
  return ABBREVIATIONS.includes(m[1].toLowerCase().replace(/\.$/, ""));
}

/** A '.' between digits (7.5) or before a lowercase letter is not a boundary. */
function isRealBoundary(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === "!" || ch === "?") return true;
  if (ch !== ".") return false;
  const prev = text[i - 1];
  const next = text[i + 1];
  if (prev && next && /\d/.test(prev) && /\d/.test(next)) return false;
  if (next && /[a-z]/.test(next)) return false;
  return !endsWithAbbreviation(text.slice(0, i + 1));
}

export class SentenceBuffer {
  private buf = "";

  /** Feed a token/delta; returns every complete sentence now available. */
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];

    for (;;) {
      let cut = -1;
      for (let i = 0; i < this.buf.length; i++) {
        if (!/[.!?]/.test(this.buf[i])) continue;
        if (!isRealBoundary(this.buf, i)) continue;
        // Include trailing quotes/brackets that belong to the sentence.
        let end = i + 1;
        while (end < this.buf.length && /["')\]]/.test(this.buf[end])) end++;
        if (end >= MIN_CHUNK) cut = end;
        break;
      }

      if (cut === -1 && this.buf.length > SOFT_LIMIT) {
        // No full stop yet — fall back to the last clause break before the limit.
        const slice = this.buf.slice(0, SOFT_LIMIT);
        const comma = Math.max(slice.lastIndexOf(", "), slice.lastIndexOf("; "), slice.lastIndexOf(" — "));
        if (comma > MIN_CHUNK) cut = comma + 1;
      }

      if (cut === -1) break;
      const sentence = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut);
      if (sentence) out.push(sentence);
    }

    return out;
  }

  /** Whatever is left when the model stops producing tokens. */
  flush(): string | null {
    const rest = this.buf.trim();
    this.buf = "";
    return rest || null;
  }

  get pending(): string {
    return this.buf;
  }
}
