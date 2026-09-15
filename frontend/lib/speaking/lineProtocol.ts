/**
 * Incremental parser for the examiner's line protocol:
 *
 *   T: <transcript>
 *   E: <emotion>
 *   C: {"topic": "...", "bullets": [...]}   (optional)
 *   R: <spoken reply, streamed>
 *
 * Everything before `R:` is metadata we need *before* synthesis can start
 * (the emotion picks the voice settings). Everything after `R:` is forwarded
 * to TTS as it arrives.
 */
export interface LineProtocolHandlers {
  onTranscript?: (text: string) => void;
  onEmotion?: (emotion: string) => void;
  onCueCard?: (cue: { topic: string; bullets: string[] }) => void;
  /** Called with reply text deltas, in order. */
  onReply: (delta: string) => void;
}

export class LineProtocolParser {
  private buf = "";
  private inReply = false;

  constructor(private readonly handlers: LineProtocolHandlers) {}

  push(delta: string): void {
    if (this.inReply) {
      this.handlers.onReply(delta);
      return;
    }

    this.buf += delta;

    for (;;) {
      // Once the reply marker appears, everything after it is spoken text.
      const replyAt = this.buf.search(/(^|\n)\s*R\s*:/);
      if (replyAt !== -1) {
        const head = this.buf.slice(0, replyAt);
        const rest = this.buf.slice(replyAt).replace(/^\s*\n?\s*R\s*:\s*/, "");
        this.consumeHeader(head);
        this.buf = "";
        this.inReply = true;
        if (rest) this.handlers.onReply(rest);
        return;
      }

      const nl = this.buf.indexOf("\n");
      if (nl === -1) return; // wait for a complete header line
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      this.consumeHeader(line);
    }
  }

  /** Flush a stream that ended without ever emitting an `R:` marker. */
  finish(): void {
    if (this.inReply || !this.buf.trim()) return;
    // The model ignored the format; treat the whole output as the reply so the
    // candidate still hears something instead of silence.
    const text = this.buf.replace(/^\s*[TEC]\s*:.*$/gm, "").trim();
    this.buf = "";
    if (text) {
      this.inReply = true;
      this.handlers.onReply(text);
    }
  }

  private consumeHeader(block: string): void {
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^([TEC])\s*:\s*([\s\S]*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (key === "T") this.handlers.onTranscript?.(value.trim());
      else if (key === "E") this.handlers.onEmotion?.(value.trim().toLowerCase());
      else if (key === "C") {
        try {
          const cue = JSON.parse(value);
          if (cue?.topic && Array.isArray(cue.bullets)) {
            this.handlers.onCueCard?.({
              topic: String(cue.topic),
              bullets: cue.bullets.slice(0, 4).map(String),
            });
          }
        } catch {
          /* incomplete or malformed cue card — ignored */
        }
      }
    }
  }
}
