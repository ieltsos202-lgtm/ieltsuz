export const SESSION_COOKIE = "admin_panel_session";

// Uses the Web Crypto API (globalThis.crypto.subtle) instead of Node's
// `crypto` module so this works in BOTH the Edge Runtime (middleware.ts
// runs there by default) and the Node.js runtime (API routes) without
// any special config.

function secret(): string {
  return process.env.ADMIN_PANEL_PASSWORD || "";
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(message: string): Promise<string> {
  const key = await hmacKey();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Simple signed-token session: "1700000000000.<hmac>" — no external
// session store needed for a single-admin internal tool. The token is
// only ever valid if it was signed with the current ADMIN_PANEL_PASSWORD.
export async function createSessionToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const sig = await sign(timestamp);
  return `${timestamp}.${sig}`;
}

export async function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !secret()) return false;
  const [timestamp, sig] = token.split(".");
  if (!timestamp || !sig) return false;
  const expected = await sign(timestamp);
  if (!timingSafeEqual(sig, expected)) return false;
  // Sessions expire after 7 days.
  const age = Date.now() - Number(timestamp);
  return age >= 0 && age < 7 * 24 * 60 * 60 * 1000;
}
