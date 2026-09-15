"use client";

import { supabase } from "@/lib/supabase";
import { isProActive } from "@/lib/pro";

/**
 * One-off Pro check for non-React code paths. Prefer useSubscription() in
 * components. Expiry is evaluated by lib/pro, so a stale `is_pro` flag in the
 * database can never grant access.
 */
export async function checkIsPro(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_pro, pro_expires_at")
    .eq("id", user.id)
    .single();

  return isProActive(profile);
}
