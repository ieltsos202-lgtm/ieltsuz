/**
 * Single source of truth for subscription state.
 *
 * `is_pro` alone is not enough: the flag stays true in the database until
 * something clears it, so every check must also look at `pro_expires_at`.
 * Both the UI (sidebar, guards, pages) and the payment routes use these
 * helpers so an expired subscription can never be treated as active and a
 * renewal can never shorten an existing one.
 */

export interface PlanInfo {
  id: "1m" | "3m" | "12m";
  label: string;
  days: number;
  amount: number;
}

export const PLANS: PlanInfo[] = [
  { id: "1m", label: "1 oylik", days: 30, amount: 49000 },
  { id: "3m", label: "3 oylik", days: 90, amount: 99000 },
  { id: "12m", label: "12 oylik", days: 365, amount: 399000 },
];

/** Which plan an approved payment corresponds to, by the amount paid. */
export function planFromAmount(amount?: number | null): PlanInfo | null {
  if (typeof amount !== "number") return null;
  return PLANS.find((p) => p.amount === amount) ?? null;
}

/** Subscription days a paid amount buys (defaults to the monthly plan). */
export function planDaysFromAmount(amount?: number | null): number {
  return planFromAmount(amount)?.days ?? 30;
}

export interface ProStatus {
  /** Pro flag set AND not expired. */
  active: boolean;
  expiresAt: Date | null;
  /** Whole days remaining (rounded up), 0 when inactive. */
  daysLeft: number;
  /** True when the flag is set but the date has passed. */
  expired: boolean;
}

interface ProFields {
  is_pro?: boolean | null;
  pro_expires_at?: string | null;
}

export function proStatus(profile?: ProFields | null): ProStatus {
  if (!profile?.is_pro) {
    return { active: false, expiresAt: null, daysLeft: 0, expired: false };
  }

  // A Pro flag with no expiry date is a lifetime/manual grant.
  if (!profile.pro_expires_at) {
    return { active: true, expiresAt: null, daysLeft: 0, expired: false };
  }

  const expiresAt = new Date(profile.pro_expires_at);
  if (isNaN(expiresAt.getTime())) {
    return { active: true, expiresAt: null, daysLeft: 0, expired: false };
  }

  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) {
    return { active: false, expiresAt, daysLeft: 0, expired: true };
  }

  return {
    active: true,
    expiresAt,
    daysLeft: Math.ceil(ms / 86_400_000),
    expired: false,
  };
}

/** Convenience wrapper for the many places that only need the boolean. */
export function isProActive(profile?: ProFields | null): boolean {
  return proStatus(profile).active;
}

/**
 * New expiry date for a granted subscription. Renewing early must add to the
 * time already paid for, so we count from the current expiry when it is still
 * in the future.
 */
export function extendedExpiry(currentExpiry: string | null | undefined, days: number): string {
  const now = Date.now();
  const current = currentExpiry ? new Date(currentExpiry).getTime() : NaN;
  const base = !isNaN(current) && current > now ? current : now;
  return new Date(base + days * 86_400_000).toISOString();
}

export function formatExpiry(date: Date): string {
  return date.toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}
