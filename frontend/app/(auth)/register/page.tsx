"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  BarChart3,
  Target,
  Lock,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Loader2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { apiPost, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

const LEVELS = [
  { code: "A1", label: "Beginner", desc: "Basic phrases", band: "~2.5" },
  { code: "A2", label: "Elementary", desc: "Routine tasks", band: "~3.5" },
  { code: "B1", label: "Intermediate", desc: "Travel, work situations", band: "~4.5" },
  { code: "B2", label: "Upper-Intermediate", desc: "Complex discussions", band: "~5.5" },
  { code: "C1", label: "Advanced", desc: "Fluent, flexible", band: "~7.0" },
  { code: "C2", label: "Proficient", desc: "Near-native", band: "~8.5" },
];

const BANDS = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referrerCode, setReferrerCode] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [ieltsExperience, setIeltsExperience] = useState<"first" | "before">("first");
  const [currentLevel, setCurrentLevel] = useState("");
  const [targetBand, setTargetBand] = useState(6.5);
  const [listeningBand, setListeningBand] = useState<number | null>(null);
  const [readingBand, setReadingBand] = useState<number | null>(null);
  const [writingBand, setWritingBand] = useState<number | null>(null);
  const [speakingBand, setSpeakingBand] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const totalSteps = 6;

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
    if (step === 3 && !ieltsExperience) {
      setError("Please select whether you have taken IELTS before.");
      return;
    }
    if (step === 4) {
      if (ieltsExperience === "first" && !currentLevel) {
        setError("Please select your current English level.");
        return;
      }
      if (ieltsExperience === "before") {
        if (!listeningBand || !readingBand || !writingBand || !speakingBand) {
          setError("Please enter all 4 skill band scores.");
          return;
        }
      }
    }
    if (step === 5 && !targetBand) {
      setError("Please select your target band.");
      return;
    }
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agreeToTerms) {
      setError("You must agree to the Terms and Conditions to continue.");
      return;
    }
    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        // Save profile data
        try {
          await apiPost("/api/study-plan/save", {
            current_level: ieltsExperience === "first" ? currentLevel : null,
            target_band: targetBand,
          });
          await apiPatch("/api/auth/me", {
            full_name: fullName,
            email,
            ielts_experience: ieltsExperience,
            current_level: ieltsExperience === "first" ? currentLevel : null,
            listening_band: ieltsExperience === "before" ? listeningBand : null,
            reading_band: ieltsExperience === "before" ? readingBand : null,
            writing_band: ieltsExperience === "before" ? writingBand : null,
            speaking_band: ieltsExperience === "before" ? speakingBand : null,
            target_band: targetBand,
          });
          if (referrerCode.trim()) {
            try {
              const result = await apiPost("/api/auth/apply-referral", {
                promo_code: referrerCode.trim(),
              });
              console.log("Referral applied:", result);
            } catch (err: any) {
              console.error("Referral failed:", err?.message || err);
              // non-blocking: invalid promo code should not stop onboarding
            }
          }
        } catch {
          // non-blocking
        }
        router.push("/dashboard");
      } else {
        setError("Please check your email to confirm your account, then log in.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const ProgressBar = () => (
    <div className="mb-6 flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-full transition-all duration-500 ${
            i + 1 <= step ? "bg-indigo-600" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );

  const StepHeader = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) => (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
        <Icon className="h-7 w-7 text-indigo-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <StepHeader icon={User} title="What is your name?" subtitle="Let's personalize your IELTS journey." />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Smith"
                className="text-lg"
                autoFocus
              />
            </div>
          </>
        );

      case 2:
        return (
          <>
            <StepHeader icon={Mail} title="Your email" subtitle="We'll send study reminders and tips." />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email Address</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="text-lg"
                autoFocus
              />
            </div>
            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              OR
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        );

      case 3:
        return (
          <>
            <StepHeader icon={BarChart3} title="IELTS Experience" subtitle="Have you taken IELTS before? This helps us build the perfect plan." />
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => { setIeltsExperience("first"); setCurrentLevel(""); }}
                className={`rounded-xl border p-5 text-left transition-all ${
                  ieltsExperience === "first"
                    ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-semibold text-slate-900">First time</p>
                <p className="mt-1 text-xs text-slate-500">Never taken IELTS</p>
              </button>
              <button
                type="button"
                onClick={() => { setIeltsExperience("before"); setCurrentLevel(""); }}
                className={`rounded-xl border p-5 text-left transition-all ${
                  ieltsExperience === "before"
                    ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Taken before</p>
                <p className="mt-1 text-xs text-slate-500">I know my band scores</p>
              </button>
            </div>
          </>
        );

      case 4:
        return ieltsExperience === "first" ? (
          <>
            <StepHeader icon={BarChart3} title="Your English level" subtitle="Select your current level so we can build the right plan." />
            <div className="grid gap-2">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl.code}
                  type="button"
                  onClick={() => setCurrentLevel(lvl.code)}
                  className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                    currentLevel === lvl.code
                      ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    <span className="text-sm font-bold text-slate-700">{lvl.code}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{lvl.label}</p>
                    <p className="text-xs text-slate-500">{lvl.desc}</p>
                  </div>
                  <p className="text-sm font-bold text-indigo-600">{lvl.band}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <StepHeader icon={BarChart3} title="Your previous scores" subtitle="Enter your latest IELTS band for each skill." />
            <div className="grid gap-3">
              {[
                { label: "Listening", value: listeningBand, setter: setListeningBand },
                { label: "Reading", value: readingBand, setter: setReadingBand },
                { label: "Writing", value: writingBand, setter: setWritingBand },
                { label: "Speaking", value: speakingBand, setter: setSpeakingBand },
              ].map((skill) => (
                <div key={skill.label}>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{skill.label}</label>
                  <div className="grid grid-cols-5 gap-2">
                    {BANDS.map((b) => (
                      <button
                        key={`${skill.label}-${b}`}
                        type="button"
                        onClick={() => skill.setter(b)}
                        className={`rounded-lg border py-2 text-sm font-semibold transition-all ${
                          skill.value === b
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                            : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                        }`}
                      >
                        {b.toFixed(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        );

      case 5:
        return (
          <>
            <StepHeader icon={Target} title="Target band score" subtitle="What IELTS band do you need to achieve?" />
            <div className="grid grid-cols-3 gap-2">
              {BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setTargetBand(b)}
                  className={`rounded-xl border py-3 text-sm font-semibold transition-all ${
                    targetBand === b
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                  }`}
                >
                  {b.toFixed(1)}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Have a promo code?</label>
              <Input
                value={referrerCode}
                onChange={(e) => setReferrerCode(e.target.value)}
                placeholder="IELTS-XXXX (optional)"
                className="uppercase"
              />
            </div>
          </>
        );

      case 6:
        return (
          <>
            <StepHeader icon={Lock} title="Create password" subtitle="Secure your account." />
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="agree-terms"
                  type="checkbox"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-indigo-600"
                />
                <label htmlFor="agree-terms" className="cursor-pointer text-sm text-slate-600">
                  I agree to the{" "}
                  <Link href="/terms" className="font-medium text-indigo-600 underline hover:text-indigo-700" target="_blank">
                    Terms and Conditions
                  </Link>
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Summary</p>
                <div className="mt-2 space-y-1 text-sm text-slate-500">
                  <p><span className="font-medium text-slate-700">Name:</span> {fullName}</p>
                  <p><span className="font-medium text-slate-700">Email:</span> {email}</p>
                  {ieltsExperience === "first" ? (
                    <p><span className="font-medium text-slate-700">Level:</span> {currentLevel} ({LEVELS.find(l => l.code === currentLevel)?.label})</p>
                  ) : (
                    <p><span className="font-medium text-slate-700">Previous:</span> L {listeningBand?.toFixed(1)} · R {readingBand?.toFixed(1)} · W {writingBand?.toFixed(1)} · S {speakingBand?.toFixed(1)}</p>
                  )}
                  <p><span className="font-medium text-slate-700">Target:</span> Band {targetBand.toFixed(1)}</p>
                </div>
              </div>
              {error && (
                <p className={`text-sm ${error.includes("email") ? "text-indigo-600" : "text-red-500"}`}>
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={loading || !agreeToTerms}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating account...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Create Account <CheckCircle2 className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="p-6 md:p-8">
      <div className="mb-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Step {step} of {totalSteps}
        </p>
        <h1 className="text-xl font-bold text-slate-900">
          {step === 6 ? "Almost there!" : "Getting Started"}
        </h1>
      </div>

      <ProgressBar />

      <div className="min-h-[240px]">{renderStep()}</div>

      {error && step !== 6 && (
        <p className="mt-4 text-center text-sm text-red-500">{error}</p>
      )}

      {step < 6 && (
        <div className="mt-6 flex items-center gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={handleBack}
              className="border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={handleNext}
          >
            <span className="flex items-center justify-center gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </span>
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo-600 hover:underline font-medium">
          Log in
        </Link>
      </p>
    </Card>
  );
}
