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
  const { data: { user } } = await supabase.auth.getUser(token);
  return { supabase, user };
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

export async function checkAndDecrementTrial(
  req: Request,
  skill: "listening" | "reading" | "speaking" | "writing" | "mock"
): Promise<{ ok: boolean; remaining: number; isPro: boolean; userId?: string; refundColumn?: string }> {
  const { supabase, user } = await getAuth(req);
  if (!user) return { ok: false, remaining: 0, isPro: false };

  const column = TRIAL_COLUMNS[skill];
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select(`is_pro, pro_expires_at, ${column}`)
    .eq("id", user.id)
    .single();

  if (!profile) return { ok: false, remaining: 0, isPro: false };

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
      await (supabase as any)
        .from("profiles")
        .update({ trial_mock_remaining: trialMock - 1 })
        .eq("id", user.id);
      return { ok: true, remaining: trialMock + bonusMock - 1, isPro: false, userId: user.id, refundColumn: "trial_mock_remaining" };
    } else if (bonusMock > 0) {
      await (supabase as any)
        .from("profiles")
        .update({ bonus_mock_remaining: bonusMock - 1 })
        .eq("id", user.id);
      return { ok: true, remaining: bonusMock - 1, isPro: false, userId: user.id, refundColumn: "bonus_mock_remaining" };
    }
    return { ok: false, remaining: 0, isPro: false };
  }

  const remaining = (profile[column] as number) ?? 0;
  if (remaining <= 0) {
    return { ok: false, remaining: 0, isPro: false };
  }

  await (supabase as any).from("profiles").update({ [column]: remaining - 1 }).eq("id", user.id);
  return { ok: true, remaining: remaining - 1, isPro: false, userId: user.id, refundColumn: column };
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
  try {
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select(trial.refundColumn)
      .eq("id", trial.userId)
      .single();
    const current = (profile?.[trial.refundColumn] as number) ?? 0;
    await (supabase as any)
      .from("profiles")
      .update({ [trial.refundColumn]: current + 1 })
      .eq("id", trial.userId);
  } catch (err) {
    console.error("refundTrial failed:", err);
  }
}
