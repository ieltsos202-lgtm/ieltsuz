"use client";

import { useEffect, useState } from "react";
import { Trophy, Sparkles } from "lucide-react";
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { apiGet } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { ProgressHistory, Skill, StudyRecommendation } from "@/lib/types";

const SKILLS: Skill[] = ["listening", "reading", "writing", "speaking"];
const COLORS: Record<Skill, string> = {
  listening: "#6366F1",
  reading: "#8B5CF6",
  writing: "#10B981",
  speaking: "#F59E0B",
};

function buildLineData(history: ProgressHistory) {
  const byDate: Record<string, Record<string, number | string>> = {};
  for (const skill of SKILLS) {
    for (const p of history.series[skill] || []) {
      byDate[p.date] = byDate[p.date] || { date: p.date };
      byDate[p.date][skill] = p.band;
    }
  }
  return Object.values(byDate).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}

function buildBarData(history: ProgressHistory) {
  return SKILLS.map((skill) => {
    const pts = history.series[skill] || [];
    return {
      skill: skill[0].toUpperCase() + skill.slice(1),
      start: pts[0]?.band ?? 0,
      current: pts[pts.length - 1]?.band ?? 0,
    };
  });
}

function ActivityCalendar({ activity }: { activity: Record<string, number> }) {
  const days: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 7 * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: activity[key] || 0 });
  }
  const level = (c: number) =>
    c === 0 ? "bg-bg-tertiary" : c < 2 ? "bg-accent/40" : c < 4 ? "bg-accent/70" : "bg-accent";

  // Streak: consecutive days up to today with activity.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) streak++;
    else break;
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="text-content-secondary">Last 7 weeks</span>
        {streak > 0 && <span className="font-semibold text-accent-yellow">🔥 {streak} day streak!</span>}
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count} session(s)`}
            className={`h-3.5 w-3.5 rounded-sm ${level(d.count)}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const [history, setHistory] = useState<ProgressHistory | null>(null);
  const [rec, setRec] = useState<StudyRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ProgressHistory>("/api/progress/history")
      .then(setHistory)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    apiGet<StudyRecommendation>("/api/progress/recommendation")
      .then(setRec)
      .catch(() => {});
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error || !history) {
    return (
      <Card className="mx-auto max-w-xl border-accent-red/40">
        <p className="text-sm text-content-secondary">Could not load progress: {error}</p>
      </Card>
    );
  }

  const lineData = buildLineData(history);
  const barData = buildBarData(history);
  const hasData = lineData.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Progress</h1>
        <p className="mt-1 text-content-secondary">
          Track your band trends, best results, and study focus over time.
        </p>
      </div>

      {!hasData ? (
        <Card className="border-dashed">
          <p className="text-sm text-content-secondary">
            No results yet. Complete some practice tests to see your progress charts.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle>Overall progress</CardTitle>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineData}>
                <CartesianGrid stroke="#2D2D3A" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <YAxis domain={[4, 9]} tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#111118", border: "1px solid #2D2D3A", borderRadius: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SKILLS.map((s) => (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    stroke={COLORS[s]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardTitle>Skill breakdown (first vs latest)</CardTitle>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid stroke="#2D2D3A" strokeDasharray="3 3" />
                <XAxis dataKey="skill" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <YAxis domain={[0, 9]} tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#111118", border: "1px solid #2D2D3A", borderRadius: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="start" name="First" fill="#2D2D3A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="current" name="Latest" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      <Card>
        <CardTitle>Activity</CardTitle>
        <div className="mt-3">
          <ActivityCalendar activity={history.activity} />
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-accent-yellow" /> Best results
        </CardTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SKILLS.map((s) => {
            const b = history.best[s];
            return (
              <div key={s} className="flex items-center justify-between rounded-[var(--radius)] bg-bg-tertiary px-4 py-3">
                <span className="text-sm capitalize">{s}</span>
                <span className="text-sm text-content-secondary">
                  {b ? `${b.band.toFixed(1)} — ${b.test_source || ""}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {rec && (
        <Card className="bg-gradient-to-b from-accent/10 to-bg-secondary">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" /> AI recommendation
          </CardTitle>
          <p className="mt-2 text-sm text-content-secondary">{rec.recommendation}</p>
          {rec.study_plan && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(rec.study_plan).map(([skill, pct]) => (
                <span key={skill} className="rounded-full bg-bg-tertiary px-3 py-1 text-xs capitalize text-content-secondary">
                  {skill}: {pct}%
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
