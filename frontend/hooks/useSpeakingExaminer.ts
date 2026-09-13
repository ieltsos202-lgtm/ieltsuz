"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

const DEFAULT_EXAMINER = "Adam";

function isBadName(name: string | null) {
  return !name || /\bsarah\b/i.test(name);
}

export function useSpeakingExaminer() {
  const [examinerName, setExaminerNameState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ examiner_name: string | null }>("/api/speaking/examiner");
      setExaminerNameState(isBadName(data.examiner_name) ? DEFAULT_EXAMINER : data.examiner_name!);
    } catch {
      setExaminerNameState(DEFAULT_EXAMINER);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setExaminerName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    const safe = isBadName(trimmed) ? DEFAULT_EXAMINER : trimmed;
    try {
      const data = await apiPost<{ examiner_name: string }>("/api/speaking/examiner", {
        examiner_name: safe,
      });
      setExaminerNameState(isBadName(data.examiner_name) ? DEFAULT_EXAMINER : data.examiner_name);
      return isBadName(data.examiner_name) ? DEFAULT_EXAMINER : data.examiner_name;
    } catch {
      setExaminerNameState(safe);
      return safe;
    }
  }, []);

  return {
    examinerName: examinerName || DEFAULT_EXAMINER,
    loading,
    setExaminerName,
    refresh,
  };
}
