"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Trophy,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  Headphones,
  BookOpen,
  Gamepad2,
  Clock,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Sparkles,
} from "lucide-react";
import { FullscreenToggle } from "@/components/shared/FullscreenToggle";
import { useTheme } from "@/components/ThemeProvider";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { AnimatedBand } from "@/components/shared/AnimatedBand";
import { attachVocabSelection } from "@/lib/vocabSelection";

type Kind = "listening" | "reading";

interface Mock {
  slug: string;
  url: string;
}

interface AnswerRow {
  q: number;
  user: string;
  correct: string;
  ok: boolean;
}

interface BridgePayload {
  score: number;
  total: number;
  wrong_answers: { question_number: number; user_answer: string; correct_answer: string }[];
  unanswered?: number[];
  time_spent_sec?: number;
  test_title?: string;
  answers?: AnswerRow[];
  highlighted_words?: string[];
}

interface WrongItem {
  question_number: number;
  user_answer: string;
  correct_answer: string;
  why_wrong?: string;
  explanation?: string;
  paragraph_hint?: string;
  tip: string;
}

interface VocabInsight {
  word: string;
  definition: string;
  example: string;
}

interface Feedback {
  correct_count: number;
  total_questions: number;
  band_score: number;
  wrong_analysis: WrongItem[];
  feedback: string;
  weak_areas?: string[];
  improvement_tips?: string[];
  weak_question_types?: string[];
  strategy_tips?: string[];
  vocabulary_insights?: VocabInsight[];
}

const CONFIG: Record<
  Kind,
  { label: string; prefix: string; listHref: string; nextHref: string; nextLabel: string; icon: typeof Headphones; iframeAllow: string }
> = {
  listening: {
    label: "Listening",
    prefix: "L",
    listHref: "/listening",
    nextHref: "/reading/R1",
    nextLabel: "Continue to Reading",
    icon: Headphones,
    iframeAllow: "autoplay; fullscreen",
  },
  reading: {
    label: "Reading",
    prefix: "R",
    listHref: "/reading",
    nextHref: "/writing/task1",
    nextLabel: "Continue to Writing",
    icon: BookOpen,
    iframeAllow: "fullscreen",
  },
};

function fmtTime(sec?: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MockTestRunner({ kind, testId }: { kind: Kind; testId: string }) {
  useTrialGuard(kind);
  const cfg = CONFIG[kind];
  const router = useRouter();
  const id = (testId || `${cfg.prefix}1`).toUpperCase();
  const num = id.replace(new RegExp(`^${cfg.prefix}`), "");
  const { theme } = useTheme();

  const [src, setSrc] = useState(`/mocks/${id}.html`);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const submittedRef = useRef(false);
  const [isMockTest, setIsMockTest] = useState(false);

  const [result, setResult] = useState<BridgePayload | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (localStorage.getItem("mock_test_mode") === "true") setIsMockTest(true);
  }, []);

  useEffect(() => {
    apiGet<{ mocks: Mock[] }>(`/api/${kind}/mocks`)
      .then((res) => {
        const found = res.mocks?.find((m) => m.slug.toUpperCase() === id);
        if (found?.url) setSrc(found.url);
      })
      .catch(() => {});
  }, [id, kind]);

  // Local elapsed-time ticker for the header
  useEffect(() => {
    if (result) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [result]);

  const sendTheme = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ theme }, "*");
  }, [theme]);

  useEffect(() => {
    sendTheme();
  }, [sendTheme]);

  const requestFeedback = useCallback(
    async (payload: BridgePayload) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const body: Record<string, unknown> = {
          test_id: id,
          test_title: `${cfg.label} Test ${num}`,
          correct_count: payload.score,
          total: payload.total || 40,
          wrong_answers: payload.wrong_answers || [],
          unanswered: payload.unanswered || [],
          time_spent_sec: payload.time_spent_sec || elapsed,
        };
        if (kind === "reading") body.highlighted_words = payload.highlighted_words || [];
        const fb = await apiPost<Feedback>(`/api/${kind}/feedback`, body);
        setFeedback(fb);
        if (isMockTest) {
          const mockData = JSON.parse(localStorage.getItem("mock_test_data") || "{}");
          mockData[`${kind}_band`] = fb.band_score;
          localStorage.setItem("mock_test_data", JSON.stringify(mockData));
        }
      } catch (err: any) {
        submittedRef.current = false;
        setSubmitError(err?.message || "Failed to get AI feedback.");
      } finally {
        setSubmitting(false);
      }
    },
    [id, cfg.label, num, kind, isMockTest, elapsed]
  );

  // Messages from the test iframe (bridge)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const d = event.data || {};
      if (d.type === "IELTS_REQUEST_THEME" || d.type === "IELTS_BRIDGE_READY") {
        sendTheme();
        return;
      }
      if (d.type === "IELTS_SHOW_FEEDBACK") {
        setShowFeedback(true);
        return;
      }
      if (d.type === "IELTS_TEST_COMPLETE" && d.payload && !result) {
        const p: BridgePayload = {
          ...d.payload,
          time_spent_sec: d.payload.time_spent_sec || Math.round((Date.now() - startRef.current) / 1000),
        };
        setResult(p);
        void requestFeedback(p);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendTheme, requestFeedback, result]);

  const handleIframeLoad = () => {
    sendTheme();
    startRef.current = Date.now();
    let doc: Document | null = null;
    try {
      doc = iframeRef.current?.contentDocument || null;
    } catch {
      doc = null;
    }
    const win = iframeRef.current?.contentWindow;
    if (doc && win) {
      attachVocabSelection(doc, win, (word, context) =>
        apiPost("/api/vocabulary/lookup", { word, context, source: kind })
      );
    }
  };

  const forceSubmit = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "IELTS_FORCE_SUBMIT" }, "*");
  };

  const retry = () => {
    submittedRef.current = false;
    setResult(null);
    setFeedback(null);
    setShowFeedback(false);
    setSubmitError(null);
    startRef.current = Date.now();
    setElapsed(0);
    if (iframeRef.current) iframeRef.current.src = src;
  };

  const Icon = cfg.icon;
  const unansweredCount = result?.unanswered?.length || 0;
  const wrongOnly = (result?.wrong_answers?.length || 0) - unansweredCount;

  // ---------------- Feedback view ----------------
  if (showFeedback && result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Link
            href={cfg.listHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Button variant="outline" size="sm" onClick={() => setShowFeedback(false)}>
            Review test
          </Button>
        </div>

        <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
          <Trophy className="mb-2 h-8 w-8 text-accent-yellow" />
          <p className="text-sm text-content-secondary">Your Score</p>
          <div className="text-5xl font-bold">
            {result.score}/{result.total}
          </div>
          {feedback && (
            <div className="mt-2 text-3xl font-bold text-accent">
              Band <AnimatedBand target={feedback.band_score} className="text-3xl" />
            </div>
          )}
          <div className="mt-4 grid grid-cols-4 gap-3 text-center text-xs">
            <div className="rounded-lg bg-bg-tertiary/60 px-3 py-2">
              <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-accent-green" />
              <div className="text-base font-bold">{result.score}</div>
              <div className="text-content-secondary">Correct</div>
            </div>
            <div className="rounded-lg bg-bg-tertiary/60 px-3 py-2">
              <XCircle className="mx-auto mb-1 h-4 w-4 text-accent-red" />
              <div className="text-base font-bold">{Math.max(0, wrongOnly)}</div>
              <div className="text-content-secondary">Wrong</div>
            </div>
            <div className="rounded-lg bg-bg-tertiary/60 px-3 py-2">
              <MinusCircle className="mx-auto mb-1 h-4 w-4 text-accent-yellow" />
              <div className="text-base font-bold">{unansweredCount}</div>
              <div className="text-content-secondary">Skipped</div>
            </div>
            <div className="rounded-lg bg-bg-tertiary/60 px-3 py-2">
              <Clock className="mx-auto mb-1 h-4 w-4 text-accent" />
              <div className="text-base font-bold">{fmtTime(result.time_spent_sec)}</div>
              <div className="text-content-secondary">Time</div>
            </div>
          </div>
        </Card>

        {submitting && (
          <Card className="flex items-center gap-3">
            <LoadingSpinner />
            <span className="text-sm text-content-secondary">AI is analysing your answers…</span>
          </Card>
        )}
        {submitError && (
          <Card className="border-accent-red/40">
            <p className="text-sm text-accent-red">{submitError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => requestFeedback(result)}>
              <Send className="mr-2 h-4 w-4" /> Retry AI feedback
            </Button>
          </Card>
        )}

        {feedback && (
          <>
            <Card>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-accent" /> AI Feedback
              </CardTitle>
              <p className="mt-2 text-sm leading-relaxed text-content-secondary">{feedback.feedback}</p>
            </Card>

            {(feedback.weak_areas?.length || feedback.weak_question_types?.length) ? (
              <Card className="border-accent-yellow/30">
                <CardTitle className="flex items-center gap-2 text-accent-yellow">
                  <AlertTriangle className="h-5 w-5" /> {kind === "listening" ? "Areas to Improve" : "Weak Question Types"}
                </CardTitle>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-content-secondary">
                  {(feedback.weak_areas || feedback.weak_question_types || []).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {(feedback.improvement_tips?.length || feedback.strategy_tips?.length) ? (
              <Card className="border-accent-green/30">
                <CardTitle className="flex items-center gap-2 text-accent-green">
                  <Lightbulb className="h-5 w-5" /> {kind === "listening" ? "Improvement Tips" : "Strategy Tips"}
                </CardTitle>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-content-secondary">
                  {(feedback.improvement_tips || feedback.strategy_tips || []).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {feedback.vocabulary_insights?.length ? (
              <Card>
                <CardTitle>Vocabulary Insights</CardTitle>
                <div className="mt-3 space-y-3">
                  {feedback.vocabulary_insights.map((item, i) => (
                    <div key={i} className="rounded-[var(--radius)] border border-border/50 bg-bg-tertiary/50 p-3">
                      <p className="font-semibold text-accent">{item.word}</p>
                      <p className="text-sm text-content-secondary">{item.definition}</p>
                      <p className="mt-1 text-xs italic text-content-secondary">"{item.example}"</p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {feedback.wrong_analysis?.length ? (
              <Card>
                <CardTitle>Wrong Answers Analysis</CardTitle>
                <div className="mt-3 space-y-3">
                  {feedback.wrong_analysis.map((item, i) => (
                    <div key={i} className="rounded-[var(--radius)] border border-border/50 bg-bg-tertiary/50 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-bold text-accent">Q{item.question_number}</span>
                        <span className="text-accent-red">You: "{item.user_answer}"</span>
                        <span className="text-accent-green">Correct: "{item.correct_answer}"</span>
                      </div>
                      <p className="mt-1 text-xs text-content-secondary">{item.why_wrong || item.explanation}</p>
                      {item.paragraph_hint && (
                        <p className="mt-1 text-xs text-content-secondary">Where: {item.paragraph_hint}</p>
                      )}
                      <p className="mt-1 text-xs text-accent">Tip: {item.tip}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </>
        )}

        {result.answers?.length ? (
          <Card>
            <CardTitle>Answer Sheet</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
              {result.answers.map((r) => (
                <div
                  key={r.q}
                  className={`flex items-center gap-1 rounded px-2 py-1 ${
                    r.ok ? "bg-accent-green/10 text-accent-green" : r.user ? "bg-accent-red/10 text-accent-red" : "bg-accent-yellow/10 text-accent-yellow"
                  }`}
                  title={`Q${r.q}: you "${r.user || "—"}" · correct "${r.correct}"`}
                >
                  <span className="w-6 font-bold">{r.q}</span>
                  <span className="truncate">{r.user || "—"}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/game" className="flex-1">
            <Button variant="outline" className="w-full">
              <Gamepad2 className="mr-2 h-4 w-4" /> Play Word Games
            </Button>
          </Link>
          <Button variant="outline" className="flex-1" onClick={retry}>
            <RotateCcw className="mr-2 h-4 w-4" /> Try Again
          </Button>
          {isMockTest ? (
            <Button variant="gradient" className="flex-1" onClick={() => router.push(cfg.nextHref)}>
              {cfg.nextLabel} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Link href={cfg.listHref} className="flex-1">
              <Button variant="gradient" className="w-full">
                More {cfg.label} Tests <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ---------------- Test view ----------------
  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-border bg-bg-secondary px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={cfg.listHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="hidden text-sm font-extrabold gradient-text sm:inline">IELTSUZ</span>
        </div>
        <span className="text-sm font-semibold">
          {cfg.label} Test {num}
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-content-secondary sm:inline-flex">
            <Clock className="h-3.5 w-3.5" /> {fmtTime(result?.time_spent_sec ?? elapsed)}
          </span>
          {isMockTest && !result && (
            <Button variant="gradient" size="sm" onClick={() => router.push(cfg.nextHref)} className="gap-1">
              Skip <ArrowRight className="h-3 w-3" />
            </Button>
          )}
          {result ? (
            <Button variant="gradient" size="sm" onClick={() => setShowFeedback(true)} className="gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {submitting ? "Analysing…" : "View Results"} · {result.score}/{result.total}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={forceSubmit} className="gap-1">
              <Send className="h-3 w-3" /> Finish
            </Button>
          )}
          <FullscreenToggle />
        </div>
      </div>

      {isMockTest && !result && (
        <div className="bg-accent/10 px-4 py-1 text-center text-xs font-medium text-accent">
          MOCK TEST MODE — results are recorded automatically when you submit inside the test
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          key={id}
          src={src}
          title={`${cfg.label} Test ${id}`}
          className="h-full w-full border-0"
          allow={cfg.iframeAllow}
          onLoad={handleIframeLoad}
        />
        {result && (
          <button
            onClick={() => setShowFeedback(true)}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent to-accent-purple px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
          >
            {submitting ? "AI is analysing your answers…" : `Results ready: ${result.score}/${result.total} — view analysis`}
          </button>
        )}
      </div>
    </div>
  );
}
