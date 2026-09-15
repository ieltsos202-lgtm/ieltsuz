"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(currentUser: User | null) {
      if (!currentUser) {
        if (mounted) setProfile(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();
      if (mounted) setProfile(data as Profile | null);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });

    // The profile changes outside this tab (a payment activating Pro, an admin
    // approval), so refresh it whenever the user comes back to the tab —
    // otherwise the UI keeps showing stale trial/Upgrade state until a reload.
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void supabase.auth.getUser().then(({ data }) => loadProfile(data.user ?? null));
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, profile, loading, signOut };
}
