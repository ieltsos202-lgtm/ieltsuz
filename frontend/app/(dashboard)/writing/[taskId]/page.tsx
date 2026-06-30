"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import { CheckCircle, Loader2 } from "lucide-react";
import { FullscreenToggle } from "@/components/shared/FullscreenToggle";

import { apiGet, apiPost } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timer } from "@/components/shared/Timer";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { WritingFeedbackView } from "@/components/writing/WritingFeedbackView";
import { Task1Chart, type Task1ChartData } from "@/components/writing/Task1Chart";
import type { WritingFeedback } from "@/lib/types";

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function WritingTaskInner() {
  useTrialGuard("writing");
  const router = useRouter();
  const params = useParams<{ taskId: string }>();
  const search = useSearchParams();

  const taskType = params.taskId === "task1" ? "task1" : "task2";
  const source = search.get("source") || "ai";
  const book = search.get("book");
  const test = search.get("test");

  const minWords = taskType === "task1" ? 150 : 250;
  const totalSeconds = taskType === "task1" ? 20 * 60 : 40 * 60;

  const [question, setQuestion] = useState("");
  const [chartData, setChartData] = useState<Task1ChartData | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [essay, setEssay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [evalId, setEvalId] = useState<string | null>(null);
  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [isMockTest, setIsMockTest] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const mockMode = localStorage.getItem('mock_test_mode');
    if (mockMode === 'true') setIsMockTest(true);
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const wordCount = useMemo(() => countWords(essay), [essay]);

  // Resume pending evaluation on mount (e.g. after refresh)
  useEffect(() => {
    const pendingId = typeof window !== "undefined" ? localStorage.getItem(`writing-eval-${taskType}`) : null;
    if (pendingId) {
      setEvalId(pendingId);
      setProcessing(true);
    }
  }, [taskType]);

  // Poll evaluation status
  useEffect(() => {
    if (!evalId) return;

    const poll = async () => {
      try {
        const res = await apiGet<{ status: string; result?: WritingFeedback; error?: string }>(
          `/api/evaluations/status?id=${evalId}`
        );
        if (res.status === "completed" && res.result) {
          setFeedback(res.result);
          setProcessing(false);
          setEvalId(null);
          setShowReadyBanner(true);
          localStorage.removeItem(`draft-${taskType}`);
          localStorage.removeItem(`writing-eval-${taskType}`);
          if (document.hidden && Notification.permission === "granted") {
            new Notification("Writing Evaluation Complete", {
              body: `Your ${taskType} essay band: ${res.result.band_score}`,
            });
          }
          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => setShowReadyBanner(false), 8000);
        } else if (res.status === "failed") {
          setError(res.error || "Evaluation failed. Please try again.");
          setProcessing(false);
          setEvalId(null);
          localStorage.removeItem(`writing-eval-${taskType}`);
        }
      } catch {
        // Network error, continue polling
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [evalId, taskType]);

  useEffect(() => {
    let mounted = true;
    setLoadingQuestion(true);
    const draftKey = `draft-${taskType}`;
    const draft = typeof window !== "undefined" ? localStorage.getItem(draftKey) : null;
    if (draft) setEssay(draft);

    const loader =
      source === "cambridge" && book && test
        ? apiGet<{ task1: string; task2: string; found: boolean }>(
            `/api/writing/cambridge/${book}/${test}`
          ).then((d) => (taskType === "task1" ? d.task1 : d.task2))
        : apiGet<{ question: string; chart_data?: Task1ChartData | null }>(
            `/api/writing/generate?task_type=${taskType}`
          ).then((d) => d);

    loader
      .then((d) => {
        if (!mounted) return;
        if (typeof d === "string") {
          setQuestion(d || "(Could not load a question — try AI random.)");
        } else {
          setQuestion(d.question || "(Could not load a question — try AI random.)");
          setChartData(d.chart_data || null);
        }
      })
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoadingQuestion(false));
    return () => {
      mounted = false;
    };
  }, [taskType, source, book, test]);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiPost<{ status: string; id: string; feedback?: WritingFeedback }>(
        "/api/writing/evaluate",
        {
          task_type: taskType,
          question,
          essay_text: essay,
          word_count: wordCount,
          test_source: source === "cambridge" ? `cambridge-${book}-test${test}` : "ai-generated",
          cambridge_book: book ? Number(book) : null,
          cambridge_test: test ? Number(test) : null,
        }
      );
      if (res.status === "processing" && res.id) {
        setProcessing(true);
        setEvalId(res.id);
        localStorage.setItem(`writing-eval-${taskType}`, res.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (res.feedback) {
        // Fallback for immediate response (shouldn't happen with new API)
        setFeedback(res.feedback);
        localStorage.removeItem(`draft-${taskType}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = () => {
    localStorage.setItem(`draft-${taskType}`, essay);
  };

  if (feedback) {
    // Mock test mode: save band and handle both tasks
    if (isMockTest) {
      const mockData = JSON.parse(localStorage.getItem('mock_test_data') || '{}');
      
      if (taskType === 'task1') {
        // Save task1 band and redirect to task2
        mockData.writing_task1_band = feedback.band_score;
        localStorage.setItem('mock_test_data', JSON.stringify(mockData));
        
        return (
          <div className="mx-auto max-w-2xl space-y-6 text-center">
            <Card className="space-y-4 py-8">
              <h2 className="text-2xl font-bold">Task 1 Complete!</h2>
              <p className="text-content-secondary">Your Task 1 band: <span className="text-xl font-bold text-accent">{feedback.band_score?.toFixed(1)}</span></p>
              <p className="text-sm text-content-secondary">Now complete Task 2 to finish the Writing section.</p>
              <Button
                variant="gradient"
                onClick={() => router.push('/writing/task2')}
              >
                Continue to Task 2
              </Button>
            </Card>
          </div>
        );
      } else {
        // Task 2 complete - calculate overall writing band
        const task1Band = mockData.writing_task1_band || feedback.band_score;
        const task2Band = feedback.band_score;
        const overallWritingBand = Math.round(((task1Band + task2Band) / 2) * 2) / 2;
        mockData.writing_band = overallWritingBand;
        localStorage.setItem('mock_test_data', JSON.stringify(mockData));
        
        return (
          <div className="mx-auto max-w-2xl space-y-6 text-center">
            <Card className="space-y-4 py-8">
              <h2 className="text-2xl font-bold">Writing Complete!</h2>
              <p className="text-content-secondary">Task 1: <span className="font-bold text-accent">{task1Band?.toFixed(1)}</span></p>
              <p className="text-content-secondary">Task 2: <span className="font-bold text-accent">{task2Band?.toFixed(1)}</span></p>
              <p className="text-content-secondary">Overall Writing: <span className="text-xl font-bold text-accent">{overallWritingBand?.toFixed(1)}</span></p>
              <Button
                variant="gradient"
                onClick={() => router.push('/mock-test/results')}
              >
                View Final Results
              </Button>
            </Card>
          </div>
        );
      }
    }

    return (
      <div className="mx-auto max-w-4xl">
        <WritingFeedbackView
          feedback={feedback}
          onPracticeAgain={() => router.push("/writing")}
        />
      </div>
    );
  }

  if (processing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
        </div>
        <div className="max-w-md space-y-3">
          <h2 className="text-xl font-semibold text-content-primary">
            Your essay is being evaluated
          </h2>
          <p className="text-sm text-content-secondary">
            AI is thoroughly analyzing your writing. This usually takes a few minutes.
          </p>
          <p className="text-sm font-medium text-accent">
            | O&apos;zbekcha: Sizning inshoingiz baholanmoqda. Bir necha daqiqa ichida natija tayyor bo&apos;ladi.
          </p>
          <p className="text-xs text-content-tertiary">
            You&apos;ll receive a notification as soon as the results are ready. You can leave this page.
          </p>
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="text-content-secondary">Submitting your essay...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-5">
      {showReadyBanner && (
        <div className="col-span-full flex items-center gap-2 rounded-lg bg-accent-green/10 p-3 text-sm font-medium text-accent-green animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-4 w-4" />
          Evaluation complete! Your feedback is displayed below.
        </div>
      )}
      {/* Left: question */}
      <Card className="lg:col-span-2 lg:sticky lg:top-20 lg:self-start">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            {taskType === "task1" ? "Task 1" : "Task 2"}
          </span>
          <div className="flex items-center gap-2">
            <Timer seconds={totalSeconds} />
            <FullscreenToggle />
          </div>
        </div>
        {loadingQuestion ? (
          <LoadingSpinner />
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{question}</p>
            {taskType === "task1" && chartData && <Task1Chart data={chartData} />}
          </>
        )}
        <p className="mt-4 text-xs text-content-secondary">
          Write at least {minWords} words.
        </p>
      </Card>

      {/* Right: editor */}
      <div className="space-y-3 lg:col-span-3">
        <textarea
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder="Start writing your essay here..."
          className="min-h-[420px] w-full resize-y rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={
              wordCount >= minWords
                ? "text-sm font-medium text-accent-green"
                : "text-sm text-content-secondary"
            }
          >
            {wordCount} / {minWords} words
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={saveDraft}>
              Save Draft
            </Button>
            <Button
              variant="gradient"
              onClick={submit}
              disabled={wordCount < 20 || loadingQuestion}
            >
              Submit Essay
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>
    </div>
  );
}

export default function WritingTaskPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <WritingTaskInner />
    </Suspense>
  );
}
