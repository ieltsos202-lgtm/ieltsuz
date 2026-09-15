"use client";

import { useSubscription } from "@/hooks/useSubscription";

/**
 * Backwards-compatible boolean view of the subscription. Kept as a thin
 * wrapper so Pro state has exactly one implementation (see lib/pro.ts).
 */
export function useProStatus() {
  const { active, loading } = useSubscription();
  return { isPro: active, loading };
}
