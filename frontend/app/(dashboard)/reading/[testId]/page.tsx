"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Send,
  Trophy,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import { FullscreenToggle } from "@/components/shared/FullscreenToggle";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { AnimatedBand } from "@/components/shared/AnimatedBand";
import { attachVocabSelection } from "@/lib/vocabSelection";

interface Mock {
  slug: string;
  url: string;
}

interface ReadingFeedback {
  correct_count: number;
  total_questions: number;
  band_score: number;
  wrong_analysis: {
    question_number: number;
    user_answer: string;
    correct_answer: string;
    explanation: string;
    paragraph_hint: string;
    tip: string;
  }[];
  vocabulary_insights: {
    word: string;
    definition: string;
    example: string;
  }[];
  strategy_tips: string[];
  feedback: string;
  weak_question_types: string[];
}

export default function ReadingTestPage() {
  useTrialGuard("reading");
  const params = useParams<{ testId: string }>();
  const router = useRouter();
  const id = (params.testId || "R1").toUpperCase();
  const [src, setSrc] = useState(`/mocks/${id}.html`);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const submittedRef = useRef(false);
  const { theme } = useTheme();
  const [isMockTest, setIsMockTest] = useState(false);

  // Answer panel state
  const [showPanel, setShowPanel] = useState(false);
  const [correctCount, setCorrectCount] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<ReadingFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const mockMode = localStorage.getItem('mock_test_mode');
    if (mockMode === 'true') setIsMockTest(true);
  }, []);

  useEffect(() => {
    apiGet<{ mocks: Mock[] }>("/api/reading/mocks")
      .then((res) => {
        const found = res.mocks?.find((m) => m.slug.toUpperCase() === id);
        if (found?.url) setSrc(found.url);
      })
      .catch(() => {});
  }, [id]);

  // Submit a graded result (real per-question data) to the AI feedback API.
  const submitGraded = async (
    score: number,
    total: number,
    wrong_answers: any[],
    test_title?: string,
    highlighted_words: any[] = []
  ) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const result = await apiPost<ReadingFeedback>("/api/reading/feedback", {
        test_id: id,
        test_title: test_title || `Reading Test ${id}`,
        correct_count: score,
        total: total || 40,
        wrong_answers: wrong_answers || [],
        highlighted_words: highlighted_words || [],
      });
      setFeedback(result);
      if (isMockTest) {
        const mockData = JSON.parse(localStorage.getItem("mock_test_data") || "{}");
        mockData.reading_band = result.band_score;
        localStorage.setItem("mock_test_data", JSON.stringify(mockData));
      }
    } catch (err: any) {
      submittedRef.current = false;
      setSubmitError(err.message || "Failed to get feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  // Listen for postMessage from HTML test
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "IELTS_REQUEST_THEME") {
        sendTheme();
        return;
      }
      if (event.data?.type === "IELTS_TEST_COMPLETE") {
        const { score, total, wrong_answers, test_title, highlighted_words } = event.data.payload;
        await submitGraded(score, total, wrong_answers, test_title, highlighted_words);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isMockTest]);

  // Same-origin fallback: scrape the reading test's own results when its
  // built-in results modal appears, so the AI gets the REAL per-question
  // wrong answers without needing to edit every test file.
  const handleIframeLoad = () => {
    sendTheme();
    let doc: Document | null = null;
    try {
      doc =
        iframeRef.current?.contentDocument ||
        iframeRef.current?.contentWindow?.document ||
        null;
    } catch {
      doc = null;
    }
    if (!doc) return;

    // In-place "Add to Vocabulary" when the learner selects an unknown word.
    const win = iframeRef.current?.contentWindow;
    if (win) {
      attachVocabSelection(doc, win, (word, context) =>
        apiPost("/api/vocabulary/lookup", { word, context, source: "reading" })
      );
    }

    const tryScrape = (): boolean => {
      if (submittedRef.current || !doc) return false;
      const rows = Array.from(doc.querySelectorAll(".result-row"));
      if (rows.length === 0) return false;

      const wrong: any[] = [];
      let correct = 0;
      rows.forEach((row, idx) => {
        const qn = (row.querySelector(".q-num")?.textContent || "").trim();
        const userAns = (row.querySelector(".user-ans")?.textContent || "").trim();
        const correctAns = (row.querySelector(".correct-ans")?.textContent || "").trim();
        const isWrong = row.classList.contains("incorrect");
        if (isWrong) {
          wrong.push({
            question_number: parseInt(qn, 10) || idx + 1,
            user_answer: userAns || "No Answer",
            correct_answer: correctAns,
          });
        } else {
          correct++;
        }
      });

      // Prefer the score the test itself computed.
      const scoreEl = doc.getElementById("results-score");
      const parsedScore = parseInt((scoreEl?.textContent || "").trim(), 10);
      const score = isNaN(parsedScore) ? correct : parsedScore;

      void submitGraded(score, 40, wrong, `Reading Test ${id}`);
      return true;
    };

    if (tryScrape()) return;
    const observer = new MutationObserver(() => {
      if (tryScrape()) observer.disconnect();
    });
    observer.observe(doc.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["style", "class"],
    });
  };

  const sendTheme = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ theme }, "*");
    }
  };

  useEffect(() => {
    sendTheme();
  }, [theme]);

  const finishTest = () => {
    router.push('/writing/task1');
  };

  const handleAnswerChange = (num: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [String(num)]: value }));
  };

  const submitTest = async () => {
    setSubmitError(null);
    const count = parseInt(correctCount, 10);
    if (isNaN(count) || count < 0 || count > 40) {
      setSubmitError("Enter a valid correct count (0-40).");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiPost<ReadingFeedback>("/api/reading/feedback", {
        test_id: id,
        test_title: `Reading Test ${id}`,
        correct_count: count,
        total: 40,
        wrong_answers: [],
        highlighted_words: [],
      });
      setFeedback(result);
      // Save band for mock test mode
      if (isMockTest) {
        const mockData = JSON.parse(localStorage.getItem('mock_test_data') || '{}');
        mockData.reading_band = result.band_score;
        localStorage.setItem('mock_test_data', JSON.stringify(mockData));
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to get feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  // Feedback view
  if (feedback) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/reading"
            className="inline-flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>

        {/* Score Card */}
        <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
          <Trophy className="mb-2 h-8 w-8 text-accent-yellow" />
          <p className="text-sm text-content-secondary">Your Score</p>
          <div className="text-5xl font-bold">
            {feedback.correct_count}/{feedback.total_questions}
          </div>
          <div className="mt-2 text-3xl font-bold text-accent">
            Band <AnimatedBand target={feedback.band_score} className="text-3xl" />
          </div>
        </Card>

        {/* AI Feedback */}
        <Card>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent-purple" /> AI Feedback
          </CardTitle>
          <p className="mt-2 text-sm leading-relaxed text-content-secondary">
            {feedback.feedback}
          </p>
        </Card>

        {/* Weak Question Types */}
        {feedback.weak_question_types?.length > 0 && (
          <Card className="border-accent-yellow/30">
            <CardTitle className="flex items-center gap-2 text-accent-yellow">
              <AlertTriangle className="h-5 w-5" /> Weak Question Types
            </CardTitle>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-content-secondary">
              {feedback.weak_question_types.map((area, i) => (
                <li key={i}>{area}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Strategy Tips */}
        {feedback.strategy_tips?.length > 0 && (
          <Card className="border-accent-green/30">
            <CardTitle className="flex items-center gap-2 text-accent-green">
              <Lightbulb className="h-5 w-5" /> Strategy Tips
            </CardTitle>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-content-secondary">
              {feedback.strategy_tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Vocabulary Insights */}
        {feedback.vocabulary_insights?.length > 0 && (
          <Card>
            <CardTitle>Vocabulary Insights</CardTitle>
            <div className="mt-3 space-y-3">
              {feedback.vocabulary_insights.map((item, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius)] border border-border/50 bg-bg-tertiary/50 p-3"
                >
                  <p className="font-semibold text-accent">{item.word}</p>
                  <p className="text-sm text-content-secondary">{item.definition}</p>
                  <p className="mt-1 text-xs italic text-content-secondary">
                    "{item.example}"
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Wrong Analysis */}
        {feedback.wrong_analysis?.length > 0 && (
          <Card>
            <CardTitle>Wrong Answers Analysis</CardTitle>
            <div className="mt-3 space-y-3">
              {feedback.wrong_analysis.map((item, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius)] border border-border/50 bg-bg-tertiary/50 p-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-accent">Q{item.question_number}</span>
                    <span className="text-accent-red">You: "{item.user_answer}"</span>
                    <span className="text-accent-green">Correct: "{item.correct_answer}"</span>
                  </div>
                  <p className="mt-1 text-xs text-content-secondary">{item.explanation}</p>
                  <p className="mt-1 text-xs text-accent">Tip: {item.tip}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={() => setFeedback(null)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Try Again
          </Button>
          {isMockTest ? (
            <Button variant="gradient" className="flex-1" onClick={finishTest}>
              Continue to Writing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Link href="/reading" className="flex-1">
              <Button variant="gradient" className="w-full">
                More Reading Tests <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-bg-secondary px-4 py-2">
        <Link
          href="/reading"
          className="inline-flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <span className="text-sm font-semibold">Reading Test {id.replace(/^R/, "")}</span>
        <div className="flex items-center gap-2">
          {isMockTest && (
            <Button variant="gradient" size="sm" onClick={finishTest} className="gap-1">
              Skip <ArrowRight className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPanel((s) => !s)}
            className="gap-1"
          >
            {showPanel ? (
              <>
                Hide <ChevronDown className="h-3 w-3" />
              </>
            ) : (
              <>
                Submit <ChevronUp className="h-3 w-3" />
              </>
            )}
          </Button>
          <FullscreenToggle />
        </div>
      </div>

      {isMockTest && (
        <div className="bg-accent/10 px-4 py-1 text-center text-xs font-medium text-accent">
          MOCK TEST MODE — Complete this test and submit your score, or click Skip to continue
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 transition-all ${showPanel ? "w-2/3" : "w-full"}`}>
          <iframe
            ref={iframeRef}
            key={id}
            src={src}
            title={`Reading Test ${id}`}
            className="h-full w-full border-0"
            allow="fullscreen"
            onLoad={handleIframeLoad}
          />
        </div>

        {/* Submit Panel */}
        {showPanel && (
          <div className="w-80 overflow-y-auto border-l border-border bg-bg-secondary p-4">
            <h3 className="mb-3 text-sm font-bold">Submit Answers</h3>
            <p className="mb-3 text-xs text-content-secondary">
              After completing the test in the iframe, enter how many you got correct (0-40).
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium">Correct Answers (0-40)</label>
              <Input
                type="number"
                min={0}
                max={40}
                value={correctCount}
                onChange={(e) => setCorrectCount(e.target.value)}
                placeholder="e.g. 28"
                className="text-sm"
              />
            </div>

            {/* Optional: numbered answer grid */}
            <details className="mb-4">
              <summary className="cursor-pointer text-xs text-content-secondary">
                Optional: enter individual answers
              </summary>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {Array.from({ length: 40 }, (_, i) => i + 1).map((num) => (
                  <Input
                    key={num}
                    value={answers[String(num)] || ""}
                    onChange={(e) => handleAnswerChange(num, e.target.value)}
                    placeholder={`${num}`}
                    className="h-8 text-center text-xs"
                  />
                ))}
              </div>
            </details>

            {submitError && (
              <p className="mb-2 text-xs text-accent-red">{submitError}</p>
            )}

            <Button
              variant="gradient"
              className="w-full"
              onClick={submitTest}
              disabled={submitting}
            >
              {submitting ? (
                <LoadingSpinner />
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Get AI Feedback
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
