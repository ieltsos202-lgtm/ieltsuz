import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service-role key so this standalone panel
// can read every user's data from the SAME Supabase project as the main
// IELTSUZ site, bypassing RLS. NEVER expose this key to the browser.
export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js 14 caches fetch GETs by default — a stale cached PostgREST
      // response was making the panel show a truncated user list. Force
      // every supabase-js request to bypass the cache.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
