/**
 * Stateless speaking-session cap.
 *
 * The first turn of a session mints `"<startMs>.<hmac>"`; the client echoes
 * it on every later turn. The server only has to verify the signature and the
 * age — no store, so it works identically across serverless instances and a
 * client cannot forge an earlier start time to extend the session.
 *
 * Web Crypto is used so the same code runs on the Node and Edge runtimes.
 */

const MAX_SESSION_MS =
  Math.max(1, Number(process.env.SPEAKING_MAX_SESSION_MIN) || 20) * 60 * 1000;

export const sessionExpiredMessage =
  "Sessiya vaqti tugadi (maksimum " +
  Math.round(MAX_SESSION_MS / 60000) +
  " daqiqa). Test yakunlanadi va hisobot tayyorlanadi.";

export const maxSessionMs = MAX_SESSION_MS;

function secret(): string {
  return (
    process.env.SPEAKING_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  );
}

async function sign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueSession(userId: string): Promise<string> {
  const start = Date.now().toString();
  return `${start}.${await sign(`${userId}:${start}`)}`;
}

export async function verifySession(
  token: string,
  userId: string
): Promise<{ ok: true; startedAt: number } | { ok: false; reason: "invalid" | "expired" }> {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "invalid" };
  const start = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const startedAt = Number(start);
  if (!Number.isFinite(startedAt) || !sig) return { ok: false, reason: "invalid" };
  const expected = await sign(`${userId}:${start}`);
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: "invalid" };
  const age = Date.now() - startedAt;
  if (age < 0 || age > MAX_SESSION_MS) return { ok: false, reason: "expired" };
  return { ok: true, startedAt };
}
