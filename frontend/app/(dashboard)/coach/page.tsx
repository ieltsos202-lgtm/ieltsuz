"use client";

import { useEffect, useState } from "react";
import {
  GraduationCap,
  RefreshCw,
  Target,
  CalendarClock,
  Flame,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Lightbulb,
  Sparkles,
  Loader2,
} from "lucide-react";

import { apiGet } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CoachChat } from "@/components/coach/CoachChat";
import type { CoachAnalysis, CoachAnalysisResponse, CoachSkillAnalysis, Skill } from "@/lib/types";

const SKILL_LABEL: Record<Skill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

const STATUS_STYLE: Record<
  CoachSkillAnalysis["status"],
  { label: string; chip: string; bar: string }
> = {
  on_track: { label: "On track", chip: "bg-emerald-500/15 text-emerald-400", bar: "bg-emerald-500" },
  close: { label: "Close", chip: "bg-amber-500/15 text-amber-400", bar: "bg-amber-500" },
  needs_work: { label: "Needs work", chip: "bg-red-500/15 text-red-400", bar: "bg-red-500" },
  no_data: { label: "No data", chip: "bg-bg-tertiary text-content-secondary", bar: "bg-border" },
};

function ProgressBar({ value, className = "bg-accent" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
      <div className={`h-full rounded-full transition-all ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SkillCard({ s }: { s: CoachSkillAnalysis }) {
  const style = STATUS_STYLE[s.status] || STATUS_STYLE.no_data;
  const fill = s.current != null ? (s.current / 9) * 100 : 0;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <CardTitle>{SKILL_LABEL[s.skill] || s.skill}</CardTitle>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}>{style.label}</span>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold">{s.current != null ? s.current.toFixed(1) : "—"}</span>
        <span className="mb-1 text-sm text-content-secondary">/ {s.target.toFixed(1)} target</span>
        {s.gap > 0 && (
          <span className="mb-1 ml-auto text-sm font-medium text-amber-400">+{s.gap.toFixed(1)} needed</span>
        )}
      </div>
      <ProgressBar value={fill} className={style.bar} />

      {s.summary && <p className="text-sm text-content-secondary">{s.summary}</p>}

      {s.weaknesses?.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Weak areas
          </p>
          <ul className="space-y-1">
            {s.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-content-secondary">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {s.strengths?.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Strengths
          </p>
          <ul className="space-y-1">
            {s.strengths.map((w, i) => (
              <li key={i} className="text-sm text-content-secondary">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {s.actions?.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent">
            <ListChecks className="h-3.5 w-3.5" /> Action steps
          </p>
          <ul className="space-y-1">
            {s.actions.map((w, i) => (
              <li key={i} className="text-sm text-content-secondary">{i + 1}. {w}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function CoachPage() {
  const [analysis, setAnalysis] = useState<CoachAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"analysis" | "chat">("analysis");

  const load = (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    apiGet<CoachAnalysisResponse>(`/api/coach/analysis${refresh ? "?refresh=1" : ""}`)
      .then((res) => {
        setAnalysis(res.analysis);
        setHasData(res.has_data);
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="h-7 w-7 text-accent" /> AI Teacher
          </h1>
          <p className="mt-1 text-content-secondary">
            Your personal coach analyzes all your results and shows the path to your target band.
          </p>
        </div>
        {tab === "analysis" && (
          <Button variant="outline" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        )}
      </div>

      <div className="flex gap-1 rounded-[var(--radius)] border border-border bg-bg-secondary p-1">
        {([["analysis", "Analysis"], ["chat", "Chat"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-[calc(var(--radius)-2px)] px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-accent text-white" : "text-content-secondary hover:text-content-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <CoachChat />
      ) : loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-content-secondary">AI coach is analyzing your results…</p>
        </div>
      ) : (
        <>

      {error && (
        <Card className="border-red-500/40">
          <p className="text-sm text-content-secondary">Could not load analysis: {error}</p>
        </Card>
      )}

      {!hasData && (
        <Card className="border-dashed border-accent/40 bg-accent/5">
          <p className="text-sm text-content-secondary">
            No results yet. Complete a few skill tests or a mock test for a more accurate analysis.
            The coach below still gives guidance based on your target band and level.
          </p>
        </Card>
      )}

      {analysis && (
        <>
          {/* Hero */}
          <Card className="bg-gradient-to-br from-accent/15 via-bg-secondary to-bg-secondary">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col items-center">
                <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-accent/30">
                  <span className="text-3xl font-bold">{analysis.readiness_percent ?? 0}%</span>
                </div>
                <span className="mt-2 text-xs text-content-secondary">Readiness</span>
              </div>

              <div className="flex-1 space-y-3">
                <h2 className="text-lg font-semibold">{analysis.headline}</h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-content-secondary">
                    <TrendingUp className="h-4 w-4 text-accent" />
                    Current: <strong className="text-content-primary">{analysis.current_overall != null ? analysis.current_overall.toFixed(1) : "—"}</strong>
                  </span>
                  <span className="flex items-center gap-1.5 text-content-secondary">
                    <Target className="h-4 w-4 text-emerald-400" />
                    Target: <strong className="text-content-primary">{analysis.target_band.toFixed(1)}</strong>
                  </span>
                  {analysis.overall_gap > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <Flame className="h-4 w-4" /> +{analysis.overall_gap.toFixed(1)} band needed
                    </span>
                  )}
                  {analysis.days_to_exam != null && (
                    <span className="flex items-center gap-1.5 text-content-secondary">
                      <CalendarClock className="h-4 w-4 text-accent-purple" />
                      Exam in: <strong className="text-content-primary">{analysis.days_to_exam} days</strong>
                    </span>
                  )}
                </div>
                <ProgressBar value={analysis.readiness_percent ?? 0} />
              </div>
            </div>

            {analysis.motivation && (
              <div className="mt-4 rounded-[var(--radius)] border border-accent/20 bg-accent/5 p-4">
                <p className="flex items-start gap-2 text-sm text-content-secondary">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {analysis.motivation}
                </p>
              </div>
            )}

            {analysis.priorities?.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-content-secondary">Top priorities:</span>
                {analysis.priorities.map((p, i) => (
                  <span key={i} className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium capitalize text-accent">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Per-skill */}
          <div className="grid gap-4 md:grid-cols-2">
            {analysis.skills?.map((s) => <SkillCard key={s.skill} s={s} />)}
          </div>

          {/* Weekly plan */}
          {analysis.weekly_plan?.length > 0 && (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-accent-purple" /> Weekly plan
              </CardTitle>
              <div className="mt-4 space-y-3">
                {analysis.weekly_plan.map((d, i) => (
                  <div key={i} className="rounded-[var(--radius)] border border-border bg-bg-tertiary/50 p-4">
                    <p className="font-medium text-content-primary">{d.focus}</p>
                    <ul className="mt-1.5 space-y-1">
                      {d.tasks?.map((t, j) => (
                        <li key={j} className="text-sm text-content-secondary">• {t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Strategy */}
          {analysis.strategy?.length > 0 && (
            <Card className="bg-gradient-to-b from-emerald-500/10 to-bg-secondary">
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-400" /> Strategy to reach your target
              </CardTitle>
              <ul className="mt-3 space-y-2">
                {analysis.strategy.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-center text-xs text-content-secondary">
            Analysis updates as your results change.
            {analysis.generated_at && ` Last updated: ${new Date(analysis.generated_at).toLocaleDateString()}`}
          </p>
        </>
      )}
        </>
      )}
    </div>
  );
}
