"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet, apiPost } from "@/lib/api";
import { DEFAULT_PREFS, type StudyPrefs } from "@/lib/dailyPlan";

/**
 * Study preferences + completed-task history. Updates are applied optimistically
 * so ticking a task feels instant, then persisted in the background.
 */
export function useStudyPrefs() {
  const [prefs, setPrefs] = useState<StudyPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const latest = useRef(prefs);

  useEffect(() => {
    let mounted = true;
    apiGet<StudyPrefs>("/api/study-plan/prefs")
      .then((data) => {
        if (!mounted || !data) return;
        const next: StudyPrefs = {
          start_hour: data.start_hour ?? DEFAULT_PREFS.start_hour,
          done: data.done ?? {},
        };
        latest.current = next;
        setPrefs(next);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback((next: StudyPrefs) => {
    latest.current = next;
    setPrefs(next);
    apiPost("/api/study-plan/prefs", next).catch(() => {});
  }, []);

  const setStartHour = useCallback(
    (hour: number) => persist({ ...latest.current, start_hour: hour }),
    [persist]
  );

  const toggleDone = useCallback(
    (iso: string, id: string) => {
      const current = latest.current.done?.[iso] ?? [];
      const ids = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      persist({
        ...latest.current,
        done: { ...latest.current.done, [iso]: ids },
      });
    },
    [persist]
  );

  return { prefs, loading, setStartHour, toggleDone };
}
