"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { planFromAmount, proStatus, type PlanInfo, type ProStatus } from "@/lib/pro";

/**
 * Subscription state for the UI: active/expired + days left from the profile,
 * and which plan was actually bought (derived from the last approved payment,
 * since the plan itself isn't stored on the profile).
 *
 * The plan lookup is cached per user for the tab's lifetime — the sidebar
 * mounts once per session, and the value only changes after a new payment.
 */

// Keyed by expiry too: a renewal changes the expiry, which is exactly when the
// bought plan may have changed.
let planCache: { key: string; plan: PlanInfo | null } | null = null;

export function useSubscription(): ProStatus & { plan: PlanInfo | null; loading: boolean } {
  const { user, profile, loading } = useAuth();
  const status = proStatus(profile);
  const cacheKey = user ? `${user.id}:${profile?.pro_expires_at ?? ""}` : "";
  const [plan, setPlan] = useState<PlanInfo | null>(
    cacheKey && planCache?.key === cacheKey ? planCache.plan : null
  );

  useEffect(() => {
    if (!user || !status.active) return;
    if (planCache?.key === cacheKey) {
      setPlan(planCache.plan);
      return;
    }

    let mounted = true;
    void (async () => {
      const { data } = await supabase
        .from("payments")
        .select("amount, verified_at")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const resolved = planFromAmount((data as { amount?: number } | null)?.amount);
      planCache = { key: cacheKey, plan: resolved };
      if (mounted) setPlan(resolved);
    })();

    return () => {
      mounted = false;
    };
  }, [user, cacheKey, status.active]);

  return { ...status, plan, loading };
}
