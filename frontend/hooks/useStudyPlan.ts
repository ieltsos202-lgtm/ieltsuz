"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import type { StudyPlan } from "@/lib/types";

export function useStudyPlan() {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiGet<StudyPlan>("/api/study-plan/mine")
      .then((data) => mounted && setPlan(data))
      .catch((err) => mounted && setError(err.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return { plan, loading, error };
}
