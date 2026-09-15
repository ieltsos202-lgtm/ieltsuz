"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { isProActive } from "@/lib/pro";

export function useTrialGuard(skill: "listening" | "reading" | "speaking" | "writing" | "mock") {
  const router = useRouter();
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (loading || !profile) return;
    if (isProActive(profile)) return;

    const remainingMap = {
      listening: profile.trial_listening_remaining ?? 0,
      reading: profile.trial_reading_remaining ?? 0,
      speaking: profile.trial_speaking_remaining ?? 0,
      writing: profile.trial_writing_remaining ?? 0,
      mock: (profile.trial_mock_remaining ?? 0) + (profile.bonus_mock_remaining ?? 0),
    };

    if (remainingMap[skill] <= 0) {
      router.replace("/upgrade");
    }
  }, [loading, profile, skill, router]);
}
