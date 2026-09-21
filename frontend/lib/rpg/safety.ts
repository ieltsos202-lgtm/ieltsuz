// Second line of defence. The NPC prompt already forbids unsafe content; this
// catches the cases where the model is talked into it anyway, and stops the
// player's own text from being stored or echoed when it should not be.

/**
 * Deliberately small and blunt. A big blocklist in a learning app produces
 * false positives on ordinary vocabulary ("class", "shoot a photo"), which is
 * worse than the rare miss — the prompt is the primary control.
 */
const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "bastard",
  "nigger",
  "faggot",
  "rape",
  "porn",
  "sex ",
  "suicide",
  "kill yourself",
  "kys",
];

export function containsBlocked(text: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  return BLOCKED.some((w) => t.includes(w));
}

/** Player input: strip markup, collapse whitespace, cap the length. */
export function sanitizePlayerMessage(raw: unknown, maxChars: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, " ") // no HTML — this text is rendered and re-prompted
    .replace(/[\u0000-\u001f\u007f]/g, " ") // control chars
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

/** NPC output: single line, no markdown artefacts, bounded length. */
export function sanitizeNpcLine(raw: unknown, maxChars = 400): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`#>]/g, "") // the model must not read markdown aloud
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

/**
 * Patterns that must never end up in NPC memory, even if the player types them
 * and the model dutifully extracts them as a "fact".
 */
const SENSITIVE = [
  /\+?\d[\d\s().-]{7,}/, // phone numbers
  /\b\d{1,5}\s+[A-Za-z][A-Za-z\s]{3,}\s+(street|road|avenue|lane|drive|st|rd|ave)\b/i,
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // email
  /\b(password|pin|passport\s*(no|number)|card\s*number|iban)\b/i,
  /\b(?:\d[ -]?){13,19}\b/, // card-like number runs
];

export function looksSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text));
}

/**
 * Clean a remembered fact, or reject it. Returns null when the fact is empty,
 * too long to be a fact at all, or contains personal data.
 */
export function sanitizeFact(raw: unknown, maxChars: number): string | null {
  if (typeof raw !== "string") return null;
  const fact = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (fact.length < 3) return null;
  if (looksSensitive(fact)) return null;
  if (containsBlocked(fact)) return null;
  return fact.slice(0, maxChars);
}
