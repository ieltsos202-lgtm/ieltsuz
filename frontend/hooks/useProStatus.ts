"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useProStatus() {
  const [isPro, setIsPro] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsPro(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro, pro_expires_at")
        .eq("id", user.id)
        .single();

      if (!profile?.is_pro) {
        setIsPro(false);
        setLoading(false);
        return;
      }

      if (profile.pro_expires_at) {
        const expires = new Date(profile.pro_expires_at);
        if (expires < new Date()) {
          await supabase.from("profiles").update({ is_pro: false }).eq("id", user.id);
          setIsPro(false);
          setLoading(false);
          return;
        }
      }

      setIsPro(true);
      setLoading(false);
    };

    check();
  }, []);

  return { isPro, loading };
}
