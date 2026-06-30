"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

// Returning, already-authenticated users that hit the landing page are sent
// straight to their dashboard.
export function AuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session?.user) {
        router.replace("/dashboard");
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
