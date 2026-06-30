"use client";

import { supabase } from "@/lib/supabase";

export async function checkIsPro(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_pro, pro_expires_at")
    .eq("id", user.id)
    .single();

  if (!profile?.is_pro) return false;

  if (profile.pro_expires_at) {
    const expires = new Date(profile.pro_expires_at);
    if (expires < new Date()) {
      await supabase
        .from("profiles")
        .update({ is_pro: false })
        .eq("id", user.id);
      return false;
    }
  }

  return true;
}
