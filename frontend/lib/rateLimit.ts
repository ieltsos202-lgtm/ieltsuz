import type { NextRequest } from "next/server";

/**
 * Fixed-window rate limiter for API routes that spend money (Gemini,
 * ElevenLabs). In-memory: on serverless hosting each warm instance keeps its
 * own counters, so the effective ceiling is `limit × instances` — still a hard
 * stop for scripted abuse, which is what this guards against. The
 * authenticated user id is the primary key; the IP is a secondary net for
 * unauthenticated or multi-account abuse.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** Returns true when the caller has exceeded `limit` hits per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

function sweep(now: number) {
  const expired: string[] = [];
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) expired.push(k);
  });
  expired.forEach((k) => buckets.delete(k));
  // Still full of live buckets — drop the oldest entries rather than grow.
  if (buckets.size >= MAX_BUCKETS) {
    let n = Math.floor(MAX_BUCKETS / 10);
    const oldest: string[] = [];
    buckets.forEach((_b, k) => {
      if (n-- > 0) oldest.push(k);
    });
    oldest.forEach((k) => buckets.delete(k));
  }
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
