"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import type { DashboardOverview } from "@/lib/types";

export function useProgress() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiGet<DashboardOverview>("/api/progress/overview")
      .then((data) => mounted && setOverview(data))
      .catch((err) => mounted && setError(err.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return { overview, loading, error };
}
