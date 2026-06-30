"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import { CheckCircle, Loader2 } from "lucide-react";
import { FullscreenToggle } from "@/components/shared/FullscreenToggle";

import { apiGet, apiPostForm } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timer } from "@/components/shared/Timer";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { AutoSpeakingRecorder } from "@/components/speaking/AutoSpeakingRecorder";
import {
  SpeakingFeedbackView,
  type SpeakingAnswer,
} from "@/components/speaking/SpeakingFeedbackView";
import type { SpeakingFeedback, SpeakingQuestionSet } from "@/lib/types";

// Answers are analyzed in the background, so we keep the question index to
// re-order them once every evaluation has resolved.
type IndexedAnswer = SpeakingAnswer & { _i: number };

type PendingJob = {
  id: string;
  question: string;
  qIndex: number;
};

export default function SpeakingPartPage() {
  useTrialGuard("speaking");
  const router = useRouter();
  const params = useParams<{ partId: string }>();
  const part = Number(params.partId) || 1;

  const [set, setSet] = useState<SpeakingQuestionSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<IndexedAnswer[]>([]);
  const [analyzing, setAnalyzing] = useState(0);
  const [prepDone, setPrepDone] = useState(part !== 2);
  const [questionSpoken, setQuestionSpoken] = useState(false);
  const [done, setDone] = useState(false);
  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const pendingJobsRef = useRef<PendingJob[]>([]);

  // Check if we're in mock test mode
  const [isMockTest, setIsMockTest] = useState(false);

  useEffect(() => {
    const mockMode = localStorage.getItem('mock_test_mode');
    if (mockMode === 'true') {
      setIsMockTest(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiGet<SpeakingQuestionSet>(`/api/speaking/questions/${part}`)
      .then((d) => mounted && setSet(d))
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [part]);

  const questions = set?.questions ?? [];
  const current = questions[index];
  const currentQuestion = typeof current === "string" ? current : current?.question;

  // Read question aloud using TTS
  useEffect(() => {
    if (!currentQuestion) return;
    const text = String(currentQuestion);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.onend = () => setQuestionSpoken(true);
    utterance.onerror = () => setQuestionSpoken(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentQuestion]);

  // Reset questionSpoken when moving to a new question
  useEffect(() => {
    setQuestionSpoken(false);
  }, [index]);

  // Poll pending evaluation jobs in the background
  useEffect(() => {
    const poll = async () => {
      const jobs = pendingJobsRef.current;
      if (jobs.length === 0) return;

      const stillPending: PendingJob[] = [];
      for (const job of jobs) {
        try {
          const res = await apiGet<{
            status: string;
            result?: SpeakingFeedback & { transcribed_text?: string };
            error?: string;
          }>(`/api/evaluations/status?id=${job.id}`);
          if (res.status === "completed" && res.result) {
            setAnswers((prev) => [
              ...prev,
              {
                _i: job.qIndex,
                question: job.question,
                transcribed_text: res.result!.transcribed_text || "",
                feedback: res.result as SpeakingFeedback,
              },
            ]);
            setAnalyzing((n) => Math.max(n - 1, 0));
          } else if (res.status === "failed") {
            setError((prev) => prev || "One of your answers failed to evaluate.");
            setAnalyzing((n) => Math.max(n - 1, 0));
          } else {
            stillPending.push(job);
          }
        } catch {
          stillPending.push(job);
        }
      }
      pendingJobsRef.current = stillPending;
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRecorded = (blob: Blob) => {
    setError(null);
    const q = typeof current === "string" ? current : current?.question ?? "";
    const qIndex = index;

    // Move on right away so the user is never blocked by analysis.
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      setDone(true);
    }

    // Send for evaluation in the background.
    setAnalyzing((n) => n + 1);
    void (async () => {
      try {
        const form = new FormData();
        form.append("audio", blob, "answer.webm");
        form.append("question", q);
        form.append("part", String(part));
        form.append("test_source", "ai-generated");
        const res = await apiPostForm<{
          status: string;
          id: string;
          transcribed_text?: string;
          feedback?: SpeakingFeedback;
        }>("/api/speaking/evaluate", form);

        if (res.status === "processing" && res.id) {
          pendingJobsRef.current.push({ id: res.id, question: q, qIndex });
        } else if (res.feedback) {
          // Fallback for immediate response
          const fb = res.feedback;
          setAnswers((prev) => [
            ...prev,
            {
              _i: qIndex,
              question: q,
              transcribed_text: res.transcribed_text || "",
              feedback: fb,
            },
          ]);
          setAnalyzing((n) => Math.max(n - 1, 0));
        }
      } catch (e) {
        setError((e as Error).message);
        setAnalyzing((n) => Math.max(n - 1, 0));
      }
    })();
  };

  if (loading) return <LoadingSpinner />;

  if (error && !set) {
    return (
      <Card className="mx-auto max-w-xl border-accent-red/40">
        <p className="text-sm text-content-secondary">Could not load questions: {error}</p>
      </Card>
    );
  }

  if (done) {
    // Wait for any background analyses to finish before showing results.
    if (analyzing > 0) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
          <div className="relative">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
          </div>
          <div className="max-w-md space-y-3">
            <h2 className="text-xl font-semibold text-content-primary">
              Analyzing your answers
            </h2>
            <p className="text-sm text-content-secondary">
              {analyzing} answer{analyzing > 1 ? "s" : ""} still being evaluated in the background...
            </p>
            <p className="text-sm font-medium text-accent">
              | O&apos;zbekcha: Javoblaringiz tahlil qilinmoqda. Natijalar tayyor bo&apos;lganda sizga notification yuboriladi.
            </p>
            <p className="text-xs text-content-tertiary">
              You can leave this page. Results will be saved and you&apos;ll be notified.
            </p>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      );
    }

    const sortedAnswers = [...answers].sort((a, b) => a._i - b._i);

    // Show ready banner once when transitioning from analyzing to done
    useEffect(() => {
      if (done && analyzing === 0 && sortedAnswers.length > 0) {
        setShowReadyBanner(true);
        const t = setTimeout(() => setShowReadyBanner(false), 6000);
        return () => clearTimeout(t);
      }
    }, [done, analyzing, sortedAnswers.length]);

    // Calculate average speaking band
    const avgBand = sortedAnswers.length > 0
      ? sortedAnswers.reduce((sum, a) => sum + (a.feedback?.band_score || 0), 0) / sortedAnswers.length
      : 0;

    if (isMockTest && avgBand > 0) {
      const mockData = JSON.parse(localStorage.getItem('mock_test_data') || '{}');
      
      // Save this part's band
      const bandKey = `speaking_part${part}_band` as const;
      mockData[bandKey] = Math.round(avgBand * 2) / 2;
      localStorage.setItem('mock_test_data', JSON.stringify(mockData));
      
      // Navigate to next part or to listening
      if (part < 3) {
        return (
          <div className="mx-auto max-w-2xl space-y-6 text-center">
            <Card className="space-y-4 py-8">
              <h2 className="text-2xl font-bold">Part {part} Complete!</h2>
              <p className="text-content-secondary">Your Part {part} band: <span className="text-xl font-bold text-accent">{avgBand.toFixed(1)}</span></p>
              <Button
                variant="gradient"
                onClick={() => router.push(`/speaking/${part + 1}`)}
              >
                Continue to Part {part + 1}
              </Button>
            </Card>
          </div>
        );
      }
      
      // All 3 parts complete - calculate overall speaking band
      const p1 = mockData.speaking_part1_band || avgBand;
      const p2 = mockData.speaking_part2_band || avgBand;
      const p3 = mockData.speaking_part3_band || avgBand;
      const overallBand = Math.round(((p1 + p2 + p3) / 3) * 2) / 2;
      mockData.speaking_band = overallBand;
      localStorage.setItem('mock_test_data', JSON.stringify(mockData));
      
      return (
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <Card className="space-y-4 py-8">
            <h2 className="text-2xl font-bold">Speaking Complete!</h2>
            <p className="text-content-secondary">Overall Speaking Band: <span className="text-xl font-bold text-accent">{overallBand.toFixed(1)}</span></p>
            <Button
              variant="gradient"
              onClick={() => router.push('/listening/L1')}
            >
              Continue to Listening
            </Button>
          </Card>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {showReadyBanner && (
          <div className="flex items-center gap-2 rounded-lg bg-accent-green/10 p-3 text-sm font-medium text-accent-green animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="h-4 w-4" />
            All evaluations complete! Your results are displayed below.
          </div>
        )}
        <SpeakingFeedbackView
          answers={sortedAnswers}
          onPracticeAgain={() => router.push("/speaking")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Speaking — Part {part}</h1>
        <div className="flex items-center gap-2">
          {part !== 2 && (
            <span className="text-sm text-content-secondary">
              Question {index + 1} of {questions.length}
            </span>
          )}
          {analyzing > 0 && (
            <span className="flex items-center gap-1 text-xs text-content-secondary">
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing {analyzing}…
            </span>
          )}
          <FullscreenToggle />
        </div>
      </div>

      {part === 2 ? (
        <Card className="border-accent-yellow/50 bg-accent-yellow/5">
          <p className="text-xs font-semibold uppercase text-accent-yellow">Cue card</p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{currentQuestion}</p>
          {set?.bullets && set.bullets.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-content-secondary">
              {set.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          )}
          {!prepDone && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-content-secondary">Preparation time:</span>
              <Timer seconds={60} onElapsed={() => setPrepDone(true)} />
              <Button variant="outline" size="sm" onClick={() => setPrepDone(true)}>
                I&apos;m ready
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-xs font-semibold uppercase text-content-secondary">Question</p>
          <p className="mt-2 text-lg leading-relaxed">{currentQuestion}</p>
        </Card>
      )}

      {prepDone && questionSpoken && (
        <Card>
          <AutoSpeakingRecorder
            key={index}
            isCueCard={part === 2}
            onComplete={handleRecorded}
          />
        </Card>
      )}

      {prepDone && !questionSpoken && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="relative">
              <div className="h-3 w-3 animate-ping rounded-full bg-accent" />
              <div className="absolute inset-0 h-3 w-3 rounded-full bg-accent" />
            </div>
            <p className="text-sm font-medium text-content-secondary">The examiner is asking the question...</p>
          </div>
        </Card>
      )}

      {error && <p className="text-center text-sm text-accent-red">{error}</p>}
    </div>
  );
}
