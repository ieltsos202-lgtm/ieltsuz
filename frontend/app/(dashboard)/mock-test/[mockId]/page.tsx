"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import Link from "next/link";
import { Headphones, BookOpen, PenLine, Mic, ExternalLink, Loader2 } from "lucide-react";

import { apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timer } from "@/components/shared/Timer";
import { AnimatedBand } from "@/components/shared/AnimatedBand";
import { RadarChart } from "@/components/dashboard/RadarChart";
import type { Skill } from "@/lib/types";

const BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

const STAGES: { key: Skill; label: string; icon: typeof Headphones; href: string; duration: string }[] = [
  { key: "speaking", label: "Speaking", icon: Mic, href: "/speaking", duration: "11-14 min" },
  { key: "listening", label: "Listening", icon: Headphones, href: "/listening", duration: "30 min" },
  { key: "reading", label: "Reading", icon: BookOpen, href: "/reading", duration: "60 min" },
  { key: "writing", label: "Writing", icon: PenLine, href: "/writing", duration: "60 min" },
];

interface MockResult {
  overall_band: number | null;
  result: { overall_feedback?: string | null };
}

export default function MockTestRunPage() {
  useTrialGuard("mock");
  const router = useRouter();
  const params = useParams<{ mockId: string }>();
  const { profile } = useAuth();
  const mockId = params.mockId || "1";

  const [bands, setBands] = useState<Record<Skill, number | null>>({
    listening: null,
    reading: null,
    writing: null,
    speaking: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MockResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load bands from localStorage on mount
  useEffect(() => {
    const mockData = JSON.parse(localStorage.getItem('mock_test_data') || '{}');
    setBands({
      listening: mockData.listening_band || null,
      reading: mockData.reading_band || null,
      writing: mockData.writing_band || null,
      speaking: mockData.speaking_band || null,
    });
  }, []);

  const target = profile?.target_band ?? 7;
  const completed = STAGES.filter((s) => bands[s.key] !== null).length;
  const progress = Math.round((completed / STAGES.length) * 100);

  const finish = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiPost<MockResult>("/api/mock-test/evaluate", {
        mock_test_id: mockId,
        listening_band: bands.listening,
        reading_band: bands.reading,
        writing_band: bands.writing,
        speaking_band: bands.speaking,
        duration_minutes: 165,
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-content-secondary">Calculating your overall band...</p>
      </div>
    );
  }

  if (result) {
    const radar = STAGES.map((s) => ({
      skill: s.label,
      current: bands[s.key] ?? 0,
      target,
    }));
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
          <p className="text-sm text-content-secondary">🏆 Overall Band</p>
          <AnimatedBand target={result.overall_band ?? 0} className="text-6xl" />
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {STAGES.map((s) => (
            <Card key={s.key} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <s.icon className="h-4 w-4 text-accent" /> {s.label}
              </span>
              <span className="text-xl font-bold tabular-nums">
                {bands[s.key]?.toFixed(1) ?? "—"}
              </span>
            </Card>
          ))}
        </div>

        <Card>
          <CardTitle>Skill overview</CardTitle>
          <RadarChart data={radar} />
        </Card>

        {result.result?.overall_feedback && (
          <Card>
            <CardTitle>AI recommendation</CardTitle>
            <p className="mt-2 text-sm text-content-secondary">
              {result.result.overall_feedback}
            </p>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href="/progress">
            <Button variant="gradient">View Progress</Button>
          </Link>
          <Button variant="outline" onClick={() => router.push("/mock-test")}>
            New Mock Test
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mock Test Session</h1>
        <Timer seconds={165 * 60} />
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-sm text-content-secondary">{progress}% complete</p>

      <p className="text-sm text-content-secondary">
        Complete each section in order. Your bands will be saved automatically. When all four skills are complete, click Finish to see your overall result.
      </p>

      <div className="space-y-3">
        {STAGES.map((s, i) => (
          <Card key={s.key} className={`space-y-3 ${bands[s.key] !== null ? 'border-accent/30' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  bands[s.key] !== null
                    ? 'bg-accent text-white'
                    : 'bg-accent/20 text-accent'
                }`}>
                  {i + 1}
                </span>
                <s.icon className="h-4 w-4 text-accent" />
                <span>{s.label}</span>
                <span className="text-xs text-content-secondary">({s.duration})</span>
              </span>
              {bands[s.key] !== null ? (
                <span className="text-sm font-bold text-accent">{bands[s.key]?.toFixed(1)}</span>
              ) : (
                <Link
                  href={s.key === 'speaking' ? '/speaking/1' : s.key === 'listening' ? '/listening/L1' : s.key === 'reading' ? '/reading/R1' : '/writing/task1'}
                  className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90"
                >
                  Start <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            {bands[s.key] === null && (
              <p className="text-xs text-content-secondary">
                Click Start to begin the {s.label.toLowerCase()} test. After completion, return here to record your band score.
              </p>
            )}
            {bands[s.key] === null ? (
              <div className="flex flex-wrap gap-1.5">
                {BANDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBands((s2) => ({ ...s2, [s.key]: b }))}
                    className="rounded-[var(--radius)] border border-border bg-bg-tertiary px-2.5 py-1 text-xs font-semibold text-content-secondary transition-colors hover:border-accent/40"
                  >
                    {b.toFixed(1)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-content-secondary">Your band:</span>
                <div className="flex flex-wrap gap-1.5">
                  {BANDS.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBands((s2) => ({ ...s2, [s.key]: b }))}
                      className={`rounded-[var(--radius)] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        bands[s.key] === b
                          ? "border-accent bg-accent/15"
                          : "border-border bg-bg-tertiary text-content-secondary hover:border-accent/40"
                      }`}
                    >
                      {b.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <Button
        variant="gradient"
        size="lg"
        className="w-full"
        onClick={finish}
        disabled={completed === 0}
      >
        Finish & See Results
      </Button>
    </div>
  );
}
