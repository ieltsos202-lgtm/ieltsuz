"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Headphones, BookOpen, PenLine, Mic, AlertTriangle, Target, Calendar, Clock, BookOpen as BookIcon, Sparkles } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useProgress } from "@/hooks/useProgress";
import { useStudyPlan } from "@/hooks/useStudyPlan";
import { apiGet } from "@/lib/api";
import { getFocusAreasText, getTodaysGoal } from "@/lib/dashboardHelpers";
import { daysUntil } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RadarChart } from "@/components/dashboard/RadarChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { Skill } from "@/lib/types";

const SKILL_META: { key: Skill; label: string; icon: string }[] = [
  { key: "listening", label: "Listening", icon: "🎧" },
  { key: "reading", label: "Reading", icon: "📖" },
  { key: "writing", label: "Writing", icon: "✍️" },
  { key: "speaking", label: "Speaking", icon: "🎙️" },
];

const QUICK_START = [
  { href: "/listening", label: "Listening", desc: "Cambridge audio tests", icon: Headphones, color: "text-accent" },
  { href: "/reading", label: "Reading", desc: "Interactive passages", icon: BookOpen, color: "text-accent-purple" },
  { href: "/writing", label: "Writing", desc: "AI examiner feedback", icon: PenLine, color: "text-accent-green" },
  { href: "/speaking", label: "Speaking", desc: "Voice + pronunciation", icon: Mic, color: "text-accent-yellow" },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const { overview, loading } = useProgress();
  const { plan: studyPlan, loading: planLoading } = useStudyPlan();
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const days = daysUntil(profile?.exam_date);
  const target = profile?.target_band ?? 6.5;
  const firstName = (profile?.full_name || "there").split(" ")[0];

  useEffect(() => {
    apiGet<{ recommendation: string }>("/api/progress/recommendation")
      .then((res) => setRecommendation(res.recommendation ?? null))
      .catch(() => {});
  }, []);

  const todaysGoal = getTodaysGoal(overview, studyPlan, profile);
  const focusText = getFocusAreasText(overview, studyPlan, profile, recommendation);

  const radarData = SKILL_META.map((s) => ({
    skill: s.label,
    current: overview?.stats?.[s.key]?.current ?? 0,
    target,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Welcome banner */}
      <Card className="bg-gradient-to-r from-accent/15 to-accent-purple/10">
        <h1 className="text-2xl font-bold">
          Hello, {firstName}! 👋
        </h1>
        <p className="mt-1 text-content-secondary">
          {days !== null
            ? `Your exam is in ${days} days. `
            : studyPlan
              ? `Estimated readiness: ${studyPlan.estimated_readiness_date}. `
              : "Set your exam date in your profile. "}
          Today&apos;s goal: <span className="text-content-primary font-medium">{todaysGoal}</span>
        </p>
      </Card>

      {/* Trial usage */}
      {profile && !profile.is_pro && (
        <Card className="border-accent-yellow/30 bg-accent-yellow/5">
          <p className="text-sm font-semibold text-accent-yellow">Free Trials Remaining</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "Listening", val: profile.trial_listening_remaining ?? 0 },
              { label: "Reading", val: profile.trial_reading_remaining ?? 0 },
              { label: "Speaking", val: profile.trial_speaking_remaining ?? 0 },
              { label: "Writing", val: profile.trial_writing_remaining ?? 0 },
              { label: "Mock Test", val: (profile.trial_mock_remaining ?? 0) + (profile.bonus_mock_remaining ?? 0) },
            ].map((t) => (
              <div
                key={t.label}
                className={`rounded-lg p-2 text-center ${t.val === 0 ? "bg-accent-red/10 text-accent-red" : "bg-bg-tertiary/50 text-content-primary"}`}
              >
                <p className="text-lg font-bold">{t.val}</p>
                <p className="text-[10px] text-content-secondary">{t.label}</p>
              </div>
            ))}
          </div>
          {(profile.bonus_mock_remaining ?? 0) > 0 && (
            <p className="mt-2 text-xs text-accent-green">
              +{profile.bonus_mock_remaining} bonus mock test(s) from referrals
            </p>
          )}
          {profile.promo_code && (
            <div className="mt-3 rounded-lg bg-bg-tertiary/50 p-2 text-center">
              <p className="text-[10px] text-content-secondary">Your referral code</p>
              <p className="text-lg font-bold tracking-wider text-accent">{profile.promo_code}</p>
              <p className="text-[10px] text-content-secondary">Share with friends & earn +1 of every skill (Listening, Reading, Speaking, Writing) and +1 Mock test for each signup!</p>
            </div>
          )}
        </Card>
      )}

      {/* AI Study Plan Card */}
      {!planLoading && studyPlan && (
        <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-accent-purple/5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Your AI Study Plan</h2>
                  <p className="text-sm text-content-secondary">
                    {studyPlan.current_level} → Band {(studyPlan.target_band ?? 6.5).toFixed(1)}
                  </p>
                </div>
                <Link href="/mock-test">
                  <Button variant="gradient" size="sm">
                    Start Mock Test
                  </Button>
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-bg-tertiary/50 p-3 text-center">
                  <Clock className="mx-auto h-4 w-4 text-accent" />
                  <p className="mt-1 text-lg font-bold">{studyPlan.estimated_days}</p>
                  <p className="text-[10px] text-content-secondary">days left</p>
                </div>
                <div className="rounded-lg bg-bg-tertiary/50 p-3 text-center">
                  <BookIcon className="mx-auto h-4 w-4 text-accent-purple" />
                  <p className="mt-1 text-lg font-bold">{studyPlan.mocks_per_week}</p>
                  <p className="text-[10px] text-content-secondary">mocks/week</p>
                </div>
                <div className="rounded-lg bg-bg-tertiary/50 p-3 text-center">
                  <Target className="mx-auto h-4 w-4 text-accent-green" />
                  <p className="mt-1 text-lg font-bold">{studyPlan.daily_study_hours}h</p>
                  <p className="text-[10px] text-content-secondary">daily study</p>
                </div>
                <div className="rounded-lg bg-bg-tertiary/50 p-3 text-center">
                  <Calendar className="mx-auto h-4 w-4 text-accent-yellow" />
                  <p className="mt-1 text-lg font-bold">{studyPlan.estimated_readiness_date}</p>
                  <p className="text-[10px] text-content-secondary">ready by</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(studyPlan.focus_skills ?? []).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-accent"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SKILL_META.map((s) => (
              <StatsCard
                key={s.key}
                icon={s.icon}
                label={s.label}
                score={overview?.stats?.[s.key]?.current ?? null}
                delta={0}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Radar */}
            <Card>
              <CardTitle>Skill overview</CardTitle>
              <p className="mb-2 text-sm text-content-secondary">
                Current vs target band ({target.toFixed(1)})
              </p>
              <RadarChart data={radarData} />
            </Card>

            {/* Recent activity */}
            <RecentActivity activity={overview?.recent_activity ?? []} />
          </div>

          {/* Focus areas */}
          <Card className="flex items-start gap-3 border-accent-yellow/40">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-yellow" />
            <div>
              <p className="font-medium">Focus Areas</p>
              <p className="text-sm text-content-secondary">{focusText}</p>
            </div>
          </Card>

          {/* Quick start */}
          <div>
            <h2 className="mb-4 text-lg font-semibold">Quick start</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_START.map((q) => (
                <Card key={q.href} className="flex flex-col gap-4">
                  <div className="inline-flex w-fit rounded-[var(--radius)] bg-bg-tertiary p-3">
                    <q.icon className={`h-6 w-6 ${q.color}`} />
                  </div>
                  <div>
                    <p className="font-semibold">{q.label}</p>
                    <p className="text-sm text-content-secondary">{q.desc}</p>
                  </div>
                  <Link href={q.href} className="mt-auto">
                    <Button variant="outline" size="sm" className="w-full">
                      Start
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
