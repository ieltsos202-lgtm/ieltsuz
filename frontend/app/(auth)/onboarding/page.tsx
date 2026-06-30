"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  BarChart3,
  Target,
  Sparkles,
  ChevronRight,
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

import { apiPost, apiPatch } from "@/lib/api";
import type { StudyPlan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const LEVELS = [
  {
    code: "A1",
    label: "Beginner",
    desc: "Basic phrases, simple questions",
    band: "~2.5",
    color: "from-red-500/20 to-orange-500/20",
    iconColor: "text-red-400",
    border: "hover:border-red-400/50",
  },
  {
    code: "A2",
    label: "Elementary",
    desc: "Routine tasks, familiar topics",
    band: "~3.5",
    color: "from-orange-500/20 to-amber-500/20",
    iconColor: "text-orange-400",
    border: "hover:border-orange-400/50",
  },
  {
    code: "B1",
    label: "Intermediate",
    desc: "Travel, work, school situations",
    band: "~4.5",
    color: "from-amber-500/20 to-yellow-500/20",
    iconColor: "text-amber-400",
    border: "hover:border-amber-400/50",
  },
  {
    code: "B2",
    label: "Upper-Intermediate",
    desc: "Complex text, technical discussions",
    band: "~5.5",
    color: "from-green-500/20 to-emerald-500/20",
    iconColor: "text-green-400",
    border: "hover:border-green-400/50",
  },
  {
    code: "C1",
    label: "Advanced",
    desc: "Fluent, flexible for social/academic",
    band: "~7.0",
    color: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-400",
    border: "hover:border-blue-400/50",
  },
  {
    code: "C2",
    label: "Proficient",
    desc: "Near-native, nuanced expression",
    band: "~8.5",
    color: "from-purple-500/20 to-violet-500/20",
    iconColor: "text-purple-400",
    border: "hover:border-purple-400/50",
  },
];

const BANDS = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentLevel, setCurrentLevel] = useState("");
  const [targetBand, setTargetBand] = useState(6.5);
  const [examDate, setExamDate] = useState("");
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 5;

  const handleNext = () => {
    setError(null);
    if (step === 1 && !fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (step === 2 && !email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (step === 3 && !currentLevel) {
      setError("Please select your current English level.");
      return;
    }
    if (step === 4 && !targetBand) {
      setError("Please select your target band.");
      return;
    }
    if (step === 4) {
      generatePlan();
      return;
    }
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const planData = await apiPost<StudyPlan>("/api/study-plan/calculate", {
        current_level: currentLevel,
        target_band: targetBand,
      });
      setPlan(planData);
      setStep(5);
    } catch (err: any) {
      setError(err.message || "Failed to generate plan.");
    } finally {
      setLoading(false);
    }
  };

  const saveAndFinish = async () => {
    setLoading(true);
    setError(null);
    try {
      // Save study plan fields
      await apiPost("/api/study-plan/save", {
        current_level: currentLevel,
        target_band: targetBand,
      });
      // Update full_name, email, exam_date via profile patch
      await apiPatch("/api/auth/me", {
        full_name: fullName,
        email,
        exam_date: examDate || null,
      });
      router.push("/dashboard");
    } catch {
      // Gracefully redirect even if API calls fail
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const ProgressBar = () => (
    <div className="mb-8 flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-full transition-all duration-500 ${
            i + 1 <= step ? "bg-accent" : "bg-bg-tertiary"
          }`}
        />
      ))}
    </div>
  );

  const StepHeader = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) => (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
        <Icon className="h-7 w-7 text-accent" />
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-content-secondary">{subtitle}</p>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <StepHeader
              icon={User}
              title="What is your name?"
              subtitle="Let's personalize your IELTS journey."
            />
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Smith"
                  className="text-lg"
                  autoFocus
                />
              </div>
            </div>
          </>
        );

      case 2:
        return (
          <>
            <StepHeader
              icon={Mail}
              title="Your email"
              subtitle="We'll send study reminders and tips."
            />
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email Address</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="text-lg"
                  autoFocus
                />
              </div>
            </div>
          </>
        );

      case 3:
        return (
          <>
            <StepHeader
              icon={BarChart3}
              title="Current English level"
              subtitle="Be honest — this helps us build the perfect plan."
            />
            <div className="grid gap-3">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl.code}
                  type="button"
                  onClick={() => setCurrentLevel(lvl.code)}
                  className={`relative flex items-center gap-4 rounded-[var(--radius)] border p-4 text-left transition-all ${
                    currentLevel === lvl.code
                      ? "border-accent bg-accent/10 ring-1 ring-accent"
                      : "border-border bg-bg-tertiary " + lvl.border
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${lvl.color}`}
                  >
                    <span className={`text-lg font-bold ${lvl.iconColor}`}>{lvl.code}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{lvl.label}</p>
                    <p className="text-sm text-content-secondary">{lvl.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-accent">{lvl.band}</p>
                    <p className="text-xs text-content-secondary">estimated</p>
                  </div>
                  {currentLevel === lvl.code && (
                    <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-accent" />
                  )}
                </button>
              ))}
            </div>
          </>
        );

      case 4:
        return (
          <>
            <StepHeader
              icon={Target}
              title="Target band score"
              subtitle="What IELTS band do you need to achieve?"
            />
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium">Target Band</label>
                <div className="grid grid-cols-3 gap-2">
                  {BANDS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setTargetBand(b)}
                      className={`rounded-[var(--radius)] border py-3 text-sm font-semibold transition-all ${
                        targetBand === b
                          ? "border-accent bg-accent/15 text-content-primary ring-1 ring-accent"
                          : "border-border bg-bg-tertiary text-content-secondary hover:border-accent/40"
                      }`}
                    >
                      {b.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Exam Date <span className="text-content-secondary">(optional)</span>
                </label>
                <Input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
              </div>
            </div>
          </>
        );

      case 5:
        if (!plan) return null;
        return (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
                <Sparkles className="h-7 w-7 text-accent" />
              </div>
              <h2 className="text-2xl font-bold">Your AI Study Plan</h2>
              <p className="mt-1 text-sm text-content-secondary">
                Personalized roadmap from {plan.current_level} to Band {plan.target_band}
              </p>
            </div>

            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="flex flex-col items-center gap-1 p-4">
                  <Clock className="h-5 w-5 text-accent" />
                  <p className="text-2xl font-bold text-accent">{plan.estimated_days}</p>
                  <p className="text-xs text-content-secondary">days to target</p>
                </Card>
                <Card className="flex flex-col items-center gap-1 p-4">
                  <BookOpen className="h-5 w-5 text-accent-purple" />
                  <p className="text-2xl font-bold text-accent-purple">{plan.mocks_per_week}</p>
                  <p className="text-xs text-content-secondary">mocks / week</p>
                </Card>
                <Card className="flex flex-col items-center gap-1 p-4">
                  <Calendar className="h-5 w-5 text-accent-green" />
                  <p className="text-2xl font-bold text-accent-green">{plan.daily_study_hours}h</p>
                  <p className="text-xs text-content-secondary">daily study</p>
                </Card>
                <Card className="flex flex-col items-center gap-1 p-4">
                  <Target className="h-5 w-5 text-accent-yellow" />
                  <p className="text-2xl font-bold text-accent-yellow">
                    {plan.estimated_readiness_date}
                  </p>
                  <p className="text-xs text-content-secondary">ready by</p>
                </Card>
              </div>

              {/* Band Progress */}
              <Card className="p-4">
                <p className="mb-2 text-sm font-medium">Band Progress</p>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-xs text-content-secondary">Current</p>
                    <p className="text-lg font-bold">{plan.current_band_estimate.toFixed(1)}</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-3 overflow-hidden rounded-full bg-bg-tertiary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-purple transition-all duration-1000"
                        style={{
                          width: `${Math.min((plan.current_band_estimate / plan.target_band) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-content-secondary">Target</p>
                    <p className="text-lg font-bold text-accent">{plan.target_band.toFixed(1)}</p>
                  </div>
                </div>
              </Card>

              {/* Message */}
              <Card className="border-accent/30 bg-accent/5 p-4">
                <p className="text-sm leading-relaxed">{plan.message}</p>
              </Card>

              {/* Focus Skills */}
              <Card className="p-4">
                <p className="mb-2 text-sm font-medium">Focus Areas</p>
                <div className="flex flex-wrap gap-2">
                  {plan.focus_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-content-secondary">
            Step {step} of {totalSteps}
          </p>
          <h1 className="text-xl font-bold">Getting Started</h1>
        </div>
        {step > 1 && step < 5 && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary"
          >
            <RotateCcw className="h-4 w-4" /> Back
          </button>
        )}
      </div>

      <ProgressBar />

      {/* Step Content */}
      <div className="min-h-[280px]">{renderStep()}</div>

      {/* Error */}
      {error && <p className="mt-4 text-center text-sm text-accent-red">{error}</p>}

      {/* Actions */}
      <div className="mt-6">
        {step < 5 ? (
          <Button
            variant="gradient"
            className="w-full"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? (
              "Calculating..."
            ) : (
              <span className="flex items-center justify-center gap-2">
                Next <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        ) : (
          <Button
            variant="gradient"
            className="w-full"
            onClick={saveAndFinish}
            disabled={loading}
          >
            {loading ? (
              "Saving..."
            ) : (
              <span className="flex items-center justify-center gap-2">
                Start My Journey <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}
