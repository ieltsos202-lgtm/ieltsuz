import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client scoped to the request's bearer token.
 * The frontend (lib/api.ts) sends the user's access token via the
 * `Authorization: Bearer <token>` header, so server routes authenticate
 * from that header (not cookies). RLS policies apply as the logged-in user.
 */
export function getAuthedClient(req: Request): { supabase: SupabaseClient; token: string } {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  return { supabase, token };
}

/**
 * Returns the authenticated Supabase client and the current user (or null).
 */
export async function getAuth(req: Request): Promise<{ supabase: SupabaseClient; user: any | null }> {
  const { supabase, token } = getAuthedClient(req);
  if (!token) return { supabase, user: null };
  const cached = authCache.get(token);
  if (cached && cached.until > Date.now()) return { supabase, user: cached.user };
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) {
    authCache.set(token, { user, until: Math.min(Date.now() + AUTH_CACHE_MS, jwtExpiryMs(token)) });
    if (authCache.size > 500) {
      const oldest = authCache.keys().next().value;
      if (oldest) authCache.delete(oldest);
    }
  }
  return { supabase, user };
}

// Verified-token cache. Voice routes (/partner, /partner/tts) are hit several
// times per minute by the same user; re-verifying the same JWT against
// Supabase Auth on every call costs ~200-400ms per request. A token that was
// valid a moment ago stays trusted for a short window (never past its exp).
const AUTH_CACHE_MS = 5 * 60 * 1000;
const authCache = new Map<string, { user: any; until: number }>();

function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Server-only Supabase client using the service-role key. It bypasses RLS and
 * is used EXCLUSIVELY for code-based payment operations (status checks,
 * screenshot verification, granting Pro) so that a phone opening `/pay/{code}`
 * — scanned from a logged-in desktop — works even without its own session.
 *
 * The service-role key NEVER reaches the browser; these calls only run inside
 * server route handlers. Returns null if the key is not configured so callers
 * can gracefully fall back to the token-based (same-device) client.
 */
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const TRIAL_COLUMNS: Record<string, string> = {
  listening: "trial_listening_remaining",
  reading: "trial_reading_remaining",
  speaking: "trial_speaking_remaining",
  writing: "trial_writing_remaining",
  mock: "trial_mock_remaining",
};

/**
 * Atomically take one unit from a numeric profile column.
 *
 * This is a compare-and-swap: the UPDATE only matches while the column still
 * holds the value we read, so two concurrent requests cannot both succeed on
 * the same credit. A plain read-then-write allowed exactly that — one credit
 * paying for two evaluations. Done without an RPC so no migration is needed.
 */
async function takeOne(
  supabase: any,
  userId: string,
  column: string,
  seen: number
): Promise<{ taken: boolean; left: number }> {
  let current = seen;
  // A few rounds is plenty: contention here is two tabs, not a stampede.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (current <= 0) return { taken: false, left: 0 };
    const { data } = await supabase
      .from("profiles")
      .update({ [column]: current - 1 })
      .eq("id", userId)
      .eq(column, current)
      .select(column)
      .maybeSingle();
    if (data) return { taken: true, left: (data[column] as number) ?? current - 1 };

    // No row came back. Either we lost the race, or this deployment cannot
    // return the updated row at all.
    const { data: fresh } = await supabase
      .from("profiles")
      .select(column)
      .eq("id", userId)
      .maybeSingle();
    const now = (fresh?.[column] as number) ?? 0;

    if (now === current) {
      // The value never moved, so nobody raced us — the UPDATE simply did not
      // hand back a representation. Degrade to a plain decrement rather than
      // hard-blocking the user from ever spending a credit.
      await supabase
        .from("profiles")
        .update({ [column]: current - 1 })
        .eq("id", userId);
      return { taken: true, left: current - 1 };
    }
    current = now;
  }
  return { taken: false, left: current };
}

export async function checkAndDecrementTrial(
  req: Request,
  skill: "listening" | "reading" | "speaking" | "writing" | "mock"
): Promise<{
  ok: boolean;
  remaining: number;
  isPro: boolean;
  userId?: string;
  refundColumn?: string;
  /** Lets routes tell "sign in again" apart from "buy Pro". */
  reason?: "unauthenticated" | "no_profile" | "exhausted";
}> {
  const { supabase, user } = await getAuth(req);
  if (!user) return { ok: false, remaining: 0, isPro: false, reason: "unauthenticated" };

  const column = TRIAL_COLUMNS[skill];
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select(
      `is_pro, pro_expires_at, ${column}${skill === "mock" ? ", bonus_mock_remaining" : ""}`
    )
    .eq("id", user.id)
    .single();

  if (!profile) return { ok: false, remaining: 0, isPro: false, reason: "no_profile" };

  if (profile.is_pro) {
    if (profile.pro_expires_at) {
      const expires = new Date(profile.pro_expires_at);
      if (expires >= new Date()) {
        return { ok: true, remaining: 999, isPro: true };
      }
    } else {
      return { ok: true, remaining: 999, isPro: true };
    }
  }

  // Mock tests can consume trial_mock_remaining first, then bonus_mock_remaining
  if (skill === "mock") {
    const trialMock = (profile.trial_mock_remaining as number) ?? 0;
    const bonusMock = (profile.bonus_mock_remaining as number) ?? 0;
    if (trialMock > 0) {
      const t = await takeOne(supabase, user.id, "trial_mock_remaining", trialMock);
      if (t.taken) {
        return {
          ok: true,
          remaining: t.left + bonusMock,
          isPro: false,
          userId: user.id,
          refundColumn: "trial_mock_remaining",
        };
      }
    }
    if (bonusMock > 0) {
      const b = await takeOne(supabase, user.id, "bonus_mock_remaining", bonusMock);
      if (b.taken) {
        return {
          ok: true,
          remaining: b.left,
          isPro: false,
          userId: user.id,
          refundColumn: "bonus_mock_remaining",
        };
      }
    }
    return { ok: false, remaining: 0, isPro: false, reason: "exhausted" };
  }

  const remaining = (profile[column] as number) ?? 0;
  if (remaining <= 0) {
    return { ok: false, remaining: 0, isPro: false, reason: "exhausted" };
  }

  const took = await takeOne(supabase, user.id, column, remaining);
  if (!took.taken) {
    return { ok: false, remaining: took.left, isPro: false, reason: "exhausted" };
  }
  return { ok: true, remaining: took.left, isPro: false, userId: user.id, refundColumn: column };
}

/**
 * The correct rejection for a failed trial check. A missing session is 401 so
 * the client can prompt a re-login; only genuine exhaustion is 402, which is
 * what the paywall listens for. Previously both returned 402 "upgrade to Pro",
 * so an expired token looked like a billing problem.
 */
export function trialDenied(trial: {
  reason?: "unauthenticated" | "no_profile" | "exhausted";
}): { error: string; status: number } {
  if (trial.reason === "unauthenticated" || trial.reason === "no_profile") {
    return { error: "Sessiya tugagan. Qaytadan tizimga kiring.", status: 401 };
  }
  return {
    error: "Bepul urinishlar tugadi. Davom etish uchun Pro ga o'ting.",
    status: 402,
  };
}

/**
 * Updates the aggregated `speaking_progress` row for a user after a speaking
 * session is evaluated (called from /api/speaking/evaluate and
 * /api/speaking/evaluate-full). Appends a band_trend point, merges recurring
 * grammar errors (deduped, counted), and bumps total_sessions.
 * Best-effort: never throws, since it must not break the evaluation response.
 */
export async function updateSpeakingProgress(
  supabase: SupabaseClient,
  userId: string,
  session: {
    bandScore: number;
    grammarErrors?: { error: string; correction: string }[];
  }
): Promise<void> {
  try {
    const { data: existing } = await (supabase as any)
      .from("speaking_progress")
      .select("total_sessions, recurring_errors, band_trend")
      .eq("user_id", userId)
      .maybeSingle();

    const bandTrend: { date: string; band_estimate: number }[] = existing?.band_trend ?? [];
    bandTrend.push({ date: new Date().toISOString(), band_estimate: session.bandScore });
    const trimmedTrend = bandTrend.slice(-30);

    const recurring: { error: string; correction: string; count: number }[] =
      existing?.recurring_errors ?? [];
    for (const ge of session.grammarErrors ?? []) {
      const key = (ge.error || "").trim().toLowerCase();
      if (!key) continue;
      const match = recurring.find((r) => r.error.trim().toLowerCase() === key);
      if (match) {
        match.count += 1;
      } else {
        recurring.push({ error: ge.error, correction: ge.correction, count: 1 });
      }
    }
    recurring.sort((a, b) => b.count - a.count);
    const trimmedRecurring = recurring.slice(0, 20);

    await (supabase as any).from("speaking_progress").upsert({
      user_id: userId,
      total_sessions: (existing?.total_sessions ?? 0) + 1,
      recurring_errors: trimmedRecurring,
      band_trend: trimmedTrend,
      last_session_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("updateSpeakingProgress failed:", err);
  }
}

/**
 * Refunds a previously-decremented trial credit. Used when a background AI
 * evaluation (writing/speaking) fails AFTER the trial was already charged,
 * so the user doesn't lose an attempt to a transient server/AI error.
 * No-op if `trial.isPro` was true (nothing was decremented) or refundColumn
 * is missing.
 */
export async function refundTrial(
  supabase: SupabaseClient,
  trial: { isPro: boolean; userId?: string; refundColumn?: string }
): Promise<void> {
  if (trial.isPro || !trial.userId || !trial.refundColumn) return;
  const column = trial.refundColumn;
  try {
    // Compare-and-swap, same reasoning as takeOne. A blind read-then-write
    // dropped the refund whenever another request touched the column in
    // between, permanently costing the user the credit being returned.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select(column)
        .eq("id", trial.userId)
        .maybeSingle();
      const current = (profile?.[column] as number) ?? 0;
      const { data } = await (supabase as any)
        .from("profiles")
        .update({ [column]: current + 1 })
        .eq("id", trial.userId)
        .eq(column, current)
        .select(column)
        .maybeSingle();
      if (data) return;
    }
    console.error("refundTrial: gave up after contention", { userId: trial.userId, column });
  } catch (err) {
    console.error("refundTrial failed:", err);
  }
}
