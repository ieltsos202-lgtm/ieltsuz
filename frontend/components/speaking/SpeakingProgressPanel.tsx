"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

interface RecurringError {
  error: string;
  correction: string;
  count: number;
}

interface BandPoint {
  date: string;
  band_estimate: number;
}

interface SpeakingProgress {
  total_sessions: number;
  recurring_errors: RecurringError[];
  last_session_at: string | null;
  band_trend: BandPoint[];
}

function barColor(score: number): string {
  if (score >= 7) return "bg-accent-green";
  if (score >= 6) return "bg-accent";
  if (score >= 5) return "bg-accent-yellow";
  return "bg-accent-red";
}

export function SpeakingProgressPanel() {
  const [progress, setProgress] = useState<SpeakingProgress | null>(null);

  useEffect(() => {
    let mounted = true;
    apiGet<SpeakingProgress>("/api/speaking/progress")
      .then((d) => mounted && setProgress(d))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!progress || progress.total_sessions === 0) return null;

  const recent = progress.band_trend.slice(-10);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold text-content-primary">Your Speaking Progress</p>
        </div>
        <span className="text-xs text-content-secondary">
          {progress.total_sessions} session{progress.total_sessions > 1 ? "s" : ""}
        </span>
      </div>

      {recent.length > 1 && (
        <div className="flex h-16 items-end gap-1">
          {recent.map((p, i) => (
            <div
              key={i}
              className={`w-full rounded-t-sm ${barColor(p.band_estimate)}`}
              style={{ height: `${(p.band_estimate / 9) * 100}%` }}
              title={`${p.band_estimate.toFixed(1)} — ${new Date(p.date).toLocaleDateString()}`}
            />
          ))}
        </div>
      )}

      {progress.recurring_errors.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-content-secondary">
            Recurring mistakes to fix
          </p>
          <div className="flex flex-wrap gap-2">
            {progress.recurring_errors.slice(0, 5).map((e, i) => (
              <span
                key={i}
                className="rounded-full border border-accent-red/30 bg-accent-red/5 px-3 py-1 text-xs text-content-secondary"
                title={`Corrected: ${e.correction}`}
              >
                {e.error} <span className="text-accent-red">×{e.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
