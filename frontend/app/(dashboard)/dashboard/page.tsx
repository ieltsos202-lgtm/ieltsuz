"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gift, Copy, Check, GraduationCap, Crown } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { formatExpiry } from "@/lib/pro";
import { useProgress } from "@/hooks/useProgress";
import { useStudyPlan } from "@/hooks/useStudyPlan";
import { useStudyPrefs } from "@/hooks/useStudyPrefs";
import { apiGet, apiPatch } from "@/lib/api";
import { getFocusAreasText } from "@/lib/dashboardHelpers";
import {
  buildDailySchedule,
  buildHomework,
  currentStreak,
  formatDateUz,
  toISODate,
  weakestSkills,
} from "@/lib/dailyPlan";
import { daysUntil } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RadarChart } from "@/components/dashboard/RadarChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ExamCountdown } from "@/components/dashboard/ExamCountdown";
import { TodayPlan } from "@/components/dashboard/TodayPlan";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { Skill } from "@/lib/types";

const SKILL_META: { key: Skill; label: string; icon: string }[] = [
  { key: "listening", label: "Listening", icon: "🎧" },
  { key: "reading", label: "Reading", icon: "📖" },
  { key: "writing", label: "Writing", icon: "✍️" },
  { key: "speaking", label: "Speaking", icon: "🎙️" },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const { overview, loading } = useProgress();
  const { plan: studyPlan } = useStudyPlan();
  const { prefs, setStartHour, toggleDone } = useStudyPrefs();
  const {
    active: proActive,
    expiresAt: proExpiresAt,
    daysLeft: proDaysLeft,
    plan: proPlan,
  } = useSubscription();
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dailyMessage, setDailyMessage] = useState<string | null>(null);
  // Set locally after saving so the countdown appears without refetching the profile.
  const [savedExamDate, setSavedExamDate] = useState<string | null>(null);

  const examDate = savedExamDate ?? profile?.exam_date ?? null;
  const days = daysUntil(examDate);
  const target = profile?.target_band ?? 6.5;
  const firstName = (profile?.full_name || "do'stim").split(" ")[0];

  // One stable "today" per mount keeps the generated plan from shifting mid-session.
  const today = useMemo(() => new Date(), []);
  const iso = toISODate(today);
  const weak = useMemo(() => weakestSkills(overview, profile), [overview, profile]);
  const blocks = useMemo(
    () => buildDailySchedule(studyPlan, prefs, weak, today),
    [studyPlan, prefs, weak, today]
  );
  const homework = useMemo(() => buildHomework(studyPlan, weak, today), [studyPlan, weak, today]);
  const doneIds = prefs.done?.[iso] ?? [];
  const streak = currentStreak(prefs, today);

  const saveExamDate = async (date: string) => {
    try {
      await apiPatch("/api/auth/me", { exam_date: date });
      setSavedExamDate(date);
    } catch {
      // Keep the form usable; the user can retry.
    }
  };

  const copyReferralCode = () => {
    if (!profile?.promo_code) return;
    navigator.clipboard.writeText(profile.promo_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    apiGet<{ recommendation: string }>("/api/progress/recommendation")
      .then((res) => setRecommendation(res.recommendation ?? null))
      .catch(() => {});
    apiGet<{ message: string }>("/api/coach/daily-message")
      .then((res) => setDailyMessage(res.message ?? null))
      .catch(() => {});
  }, []);

  const focusText = getFocusAreasText(overview, studyPlan, profile, recommendation);

  const radarData = SKILL_META.map((s) => ({
    skill: s.label,
    current: overview?.stats?.[s.key]?.current ?? 0,
    target,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Exam countdown + study load */}
      <ExamCountdown
        firstName={firstName}
        examDate={examDate}
        daysLeft={days}
        plan={studyPlan}
        streak={streak}
        onSaveExamDate={saveExamDate}
      />

      {/* Today's timetable + homework */}
      <TodayPlan
        dateLabel={formatDateUz(today, true)}
        blocks={blocks}
        homework={homework}
        doneIds={doneIds}
        startHour={prefs.start_hour}
        onToggle={(id) => toggleDone(iso, id)}
        onStartHour={setStartHour}
      />

      {/* Daily AI Coach message */}
      {dailyMessage && (
        <Card className="border-accent/30 bg-gradient-to-r from-accent/10 to-transparent">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15">
              <GraduationCap className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs font-semibold text-accent">AI ustozingizdan — bugun</p>
              <p className="mt-1 text-sm text-content-secondary">{dailyMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Subscription state: Pro users see what they have, not an upsell. */}
      {proActive && (
        <Card className="border-accent/30 bg-gradient-to-r from-accent/10 to-accent-purple/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-accent-yellow" />
              <div>
                <p className="text-sm font-semibold">
                  Pro faol{proPlan ? ` · ${proPlan.label} tarif` : ""}
                </p>
                <p className="text-xs text-content-secondary">
                  {proExpiresAt
                    ? `${proDaysLeft} kun qoldi · ${formatExpiry(proExpiresAt)}gacha`
                    : "Muddatsiz faol obuna"}
                </p>
              </div>
            </div>
            <Link href="/settings/subscription">
              <Button variant="outline" size="sm">Obunani ko&apos;rish</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Trial usage */}
      {profile && !proActive && (
        <Card className="border-accent-yellow/30 bg-accent-yellow/5">
          <p className="text-sm font-semibold text-accent-yellow">
            Bepul sinov mashg&apos;ulotlari qoldi
          </p>
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
              +{profile.bonus_mock_remaining} ta bonus mock test do'stlaringizni taklif qilganingiz uchun
            </p>
          )}
        </Card>
      )}

      {/* Referral / bonus card — trial bonuses are meaningless on Pro,
          so the card is hidden while the subscription is active. */}
      {profile?.promo_code && !proActive && (
        <Card className="border-accent/30 bg-gradient-to-br from-accent/10 to-accent-purple/10">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15">
              <Gift className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Do'stingizni taklif qiling, bonus oling! 🎉</h3>
              <p className="mt-1 text-sm text-content-secondary">
                Kodingiz orqali ro'yxatdan o'tgan har bir yangi foydalanuvchi uchun sizga{" "}
                <span className="font-semibold text-content-primary">
                  har bir bo'lim bo'yicha (Listening, Reading, Speaking, Writing) +1 mashg'ulot
                </span>{" "}
                va <span className="font-semibold text-content-primary">+1 Mock test</span> bonus beriladi!
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-bg-tertiary/60 p-5 sm:flex-row sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs text-content-secondary">Sizning referal kodingiz</p>
              <p className="text-2xl font-extrabold tracking-wider text-accent sm:text-3xl">{profile.promo_code}</p>
            </div>
            <Button onClick={copyReferralCode} className="w-full sm:w-auto">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Nusxalandi!" : "Kodni nusxalash"}
            </Button>
          </div>

          <p className="mt-3 text-center text-xs text-content-secondary sm:text-left">
            Do'stingiz ro'yxatdan o'tishda shu kodni kiritsa bo'ldi — bonus avtomatik hisoblanadi.
          </p>
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
              <CardTitle>Bo&apos;limlar bo&apos;yicha ko&apos;rsatkich</CardTitle>
              <p className="mb-2 text-sm text-content-secondary">
                Hozirgi natija va maqsad ({target.toFixed(1)}) solishtirilgan
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
              <p className="font-medium">Nimaga e&apos;tibor berish kerak</p>
              <p className="text-sm text-content-secondary">{focusText}</p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
