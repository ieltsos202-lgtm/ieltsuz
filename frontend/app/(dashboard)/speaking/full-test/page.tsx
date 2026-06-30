"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import { Mic, Loader2, Volume2, ChevronRight, CheckCircle, AlertCircle } from "lucide-react";

import { apiGet, apiPostForm } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timer } from "@/components/shared/Timer";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { AutoSpeakingRecorder } from "@/components/speaking/AutoSpeakingRecorder";
import type { SpeakingFeedback, SpeakingQuestionSet } from "@/lib/types";

// --- Types ---
interface StoredAnswer {
  part: number;
  question: string;
  blob: Blob;
  qIndex: number;
}

interface PartResult {
  part: number;
  band: number;
  feedback: string;
}

// --- Full Test Feedback View ---
function FullTestFeedbackView({
  feedback,
  transcriptions,
  onPracticeAgain,
}: {
  feedback: SpeakingFeedback & { overall_band?: number; part1_band?: number; part2_band?: number; part3_band?: number; strengths?: string[]; weaknesses?: string[] };
  transcriptions: { part: number; question: string; text: string }[];
  onPracticeAgain: () => void;
}) {
  const [openPart, setOpenPart] = useState<number | null>(1);

  const overall = feedback.overall_band ?? feedback.band_score ?? 0;
  const parts = [
    { num: 1, label: "Part 1", band: feedback.part1_band ?? overall, desc: "Introduction & Interview" },
    { num: 2, label: "Part 2", band: feedback.part2_band ?? overall, desc: "Long Turn (Cue Card)" },
    { num: 3, label: "Part 3", band: feedback.part3_band ?? overall, desc: "Two-way Discussion" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Overall Band */}
      <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
        <p className="text-sm text-content-secondary">Overall Speaking Band</p>
        <p className="text-6xl font-bold text-accent">{overall.toFixed(1)}</p>
        <div className="mt-4 flex gap-3">
          {parts.map((p) => (
            <div key={p.num} className="rounded-lg bg-bg-tertiary px-4 py-2 text-center">
              <p className="text-xs text-content-secondary">{p.label}</p>
              <p className="text-lg font-bold text-content-primary">{p.band.toFixed(1)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Criteria */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Fluency & Coherence", score: feedback.fluency_coherence },
          { label: "Lexical Resource", score: feedback.lexical_resource },
          { label: "Grammatical Range", score: feedback.grammatical_range },
          { label: "Pronunciation", score: feedback.pronunciation },
        ].map((c) => (
          <Card key={c.label} className="flex flex-col items-center py-4">
            <p className="text-xs text-content-secondary">{c.label}</p>
            <p className="text-2xl font-bold text-content-primary">{c.score?.toFixed(1) ?? "–"}</p>
          </Card>
        ))}
      </div>

      {/* Strengths & Weaknesses */}
      {(!!feedback.strengths?.length || !!feedback.weaknesses?.length) && (
        <div className="grid gap-4 md:grid-cols-2">
          {!!feedback.strengths?.length && (
            <Card className="border-accent-green/30 bg-accent-green/5 p-4">
              <p className="text-sm font-semibold text-accent-green">Strengths</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-content-secondary">
                {feedback.strengths!.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
          )}
          {!!feedback.weaknesses?.length && (
            <Card className="border-accent-red/30 bg-accent-red/5 p-4">
              <p className="text-sm font-semibold text-accent-red">Weaknesses</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-content-secondary">
                {feedback.weaknesses!.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* Transcriptions by Part */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Your Answers</h3>
        {[1, 2, 3].map((partNum) => {
          const partTranscriptions = transcriptions.filter((t) => t.part === partNum);
          if (partTranscriptions.length === 0) return null;
          return (
            <Card key={partNum} className="overflow-hidden p-0">
              <button
                onClick={() => setOpenPart(openPart === partNum ? null : partNum)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <span className="font-medium">Part {partNum} — {partTranscriptions.length} answer{partTranscriptions.length > 1 ? "s" : ""}</span>
                <ChevronRight className={`h-4 w-4 transition-transform ${openPart === partNum ? "rotate-90" : ""}`} />
              </button>
              {openPart === partNum && (
                <div className="border-t border-border p-4 space-y-3">
                  {partTranscriptions.map((t, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-content-secondary">Q{i + 1}: {t.question}</p>
                      <p className="mt-1 text-sm text-content-primary">{t.text || "[No transcription]"}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Feedback Text */}
      {feedback.feedback && (
        <Card>
          <p className="text-sm font-semibold text-content-secondary">Overall Feedback</p>
          <p className="mt-2 text-sm whitespace-pre-wrap text-content-primary">{feedback.feedback}</p>
        </Card>
      )}

      {/* Model Answer */}
      {feedback.model_answer && (
        <Card className="bg-accent/5">
          <p className="text-sm font-semibold text-accent">Model Answer (Part 2)</p>
          <p className="mt-2 text-sm whitespace-pre-wrap text-content-primary">{feedback.model_answer}</p>
        </Card>
      )}

      {/* Grammar & Vocab */}
      {feedback.grammar_errors?.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-content-secondary">Grammar Errors</p>
          <ul className="mt-2 space-y-2 text-sm">
            {feedback.grammar_errors.map((g: any, i: number) => (
              <li key={i}>
                <span className="text-accent-red line-through">{g.error}</span> →{" "}
                <span className="text-accent-green">{g.correction}</span>
                <span className="block text-xs text-content-secondary">{g.explanation}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {feedback.vocabulary_suggestions?.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-content-secondary">Vocabulary Suggestions</p>
          <ul className="mt-2 space-y-2 text-sm">
            {feedback.vocabulary_suggestions.map((v: any, i: number) => (
              <li key={i}>
                <span className="text-content-secondary">{v.used}</span> →{" "}
                <span className="text-accent">{v.better_alternative}</span>
                <span className="block text-xs text-content-secondary">{v.why}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {feedback.what_should_have_said && (
        <Card>
          <p className="text-sm font-semibold text-accent-green">What you should have said</p>
          <p className="mt-2 text-sm whitespace-pre-wrap text-content-primary">{feedback.what_should_have_said}</p>
        </Card>
      )}

      <Button variant="gradient" onClick={onPracticeAgain} className="w-full">
        Practice Again
      </Button>
    </div>
  );
}

// --- Main Page ---
export default function SpeakingFullTestPage() {
  useTrialGuard("speaking");
  const router = useRouter();

  // Phase: 'intro' | 'part1' | 'part2-prep' | 'part2-speak' | 'part3' | 'evaluating' | 'results'
  const [phase, setPhase] = useState<"intro" | "part1" | "part2-prep" | "part2-speak" | "part3" | "evaluating" | "results">("intro");

  // Questions
  const [part1Set, setPart1Set] = useState<SpeakingQuestionSet | null>(null);
  const [part2Set, setPart2Set] = useState<SpeakingQuestionSet | null>(null);
  const [part3Set, setPart3Set] = useState<SpeakingQuestionSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current question index within current part
  const [qIndex, setQIndex] = useState(0);
  const [questionSpoken, setQuestionSpoken] = useState(false);

  // Stored answers (audio blobs)
  const answersRef = useRef<StoredAnswer[]>([]);

  // Results
  const [feedback, setFeedback] = useState<(SpeakingFeedback & { overall_band?: number; part1_band?: number; part2_band?: number; part3_band?: number; strengths?: string[]; weaknesses?: string[] }) | null>(null);
  const [transcriptions, setTranscriptions] = useState<{ part: number; question: string; text: string }[]>([]);

  // Fetch all questions at start
  const startTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p1, p2, p3] = await Promise.all([
        apiGet<SpeakingQuestionSet>("/api/speaking/questions/1"),
        apiGet<SpeakingQuestionSet>("/api/speaking/questions/2"),
        apiGet<SpeakingQuestionSet>("/api/speaking/questions/3"),
      ]);
      setPart1Set(p1);
      setPart2Set(p2);
      setPart3Set(p3);
      setPhase("part1");
      setQIndex(0);
      setQuestionSpoken(false);
      answersRef.current = [];
    } catch (e: any) {
      setError(e.message || "Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  // TTS for current question
  const currentQuestion = (() => {
    if (phase === "part1") {
      const q = part1Set?.questions?.[qIndex];
      return typeof q === "string" ? q : q?.question;
    }
    if (phase === "part2-speak") {
      const q = part2Set?.questions?.[0];
      return typeof q === "string" ? q : q?.question;
    }
    if (phase === "part3") {
      const q = part3Set?.questions?.[qIndex];
      return typeof q === "string" ? q : q?.question;
    }
    return null;
  })();

  useEffect(() => {
    if (!currentQuestion) return;
    const utterance = new SpeechSynthesisUtterance(String(currentQuestion));
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

  useEffect(() => {
    setQuestionSpoken(false);
  }, [qIndex, phase]);

  const handleRecorded = (blob: Blob) => {
    setError(null);
    const q = currentQuestion ?? "";
    const part = phase === "part1" ? 1 : phase === "part2-speak" ? 2 : 3;

    answersRef.current.push({
      part,
      question: q,
      blob,
      qIndex: answersRef.current.length,
    });

    // Advance to next question or next part
    if (phase === "part1") {
      const total = part1Set?.questions?.length ?? 0;
      if (qIndex + 1 < total) {
        setQIndex(qIndex + 1);
      } else {
        setPhase("part2-prep");
      }
    } else if (phase === "part2-speak") {
      setPhase("part3");
      setQIndex(0);
    } else if (phase === "part3") {
      const total = part3Set?.questions?.length ?? 0;
      if (qIndex + 1 < total) {
        setQIndex(qIndex + 1);
      } else {
        submitForEvaluation();
      }
    }
  };

  const submitForEvaluation = async () => {
    setPhase("evaluating");
    try {
      const form = new FormData();
      answersRef.current.forEach((ans, i) => {
        form.append(`answers[${i}][part]`, String(ans.part));
        form.append(`answers[${i}][question]`, ans.question);
        form.append(`answers[${i}][audio]`, ans.blob, `answer_${i}.webm`);
      });

      const res = await apiPostForm<{
        status: string;
        feedback: SpeakingFeedback & { overall_band?: number; part1_band?: number; part2_band?: number; part3_band?: number; strengths?: string[]; weaknesses?: string[] };
        transcriptions: { part: number; question: string; text: string }[];
        error?: string;
      }>("/api/speaking/evaluate-full", form);

      if (res.error) {
        setError(res.error);
        setPhase("results");
        return;
      }

      setFeedback(res.feedback);
      setTranscriptions(res.transcriptions);
      setPhase("results");
    } catch (e: any) {
      setError(e.message || "Evaluation failed. Please try again.");
      setPhase("results");
    }
  };

  // --- Renders ---

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Full Speaking Test</h1>
          <p className="text-content-secondary">
            A complete IELTS Speaking test with all 3 parts. Your answers will be recorded and evaluated together at the end.
          </p>
        </div>

        <Card className="space-y-4 p-6 text-left">
          <h3 className="font-semibold">What to expect:</h3>
          <div className="space-y-3 text-sm text-content-secondary">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">1</span>
              <div>
                <p className="font-medium text-content-primary">Part 1 — Introduction</p>
                <p>5-6 short questions about familiar topics. Answer naturally.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">2</span>
              <div>
                <p className="font-medium text-content-primary">Part 2 — Long Turn</p>
                <p>1 minute to prepare, then speak for up to 2 minutes on a cue card.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">3</span>
              <div>
                <p className="font-medium text-content-primary">Part 3 — Discussion</p>
                <p>5 abstract questions related to the Part 2 topic.</p>
              </div>
            </div>
          </div>
          <p className="rounded-lg bg-accent-yellow/10 p-3 text-xs text-accent-yellow">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            Make sure your microphone is working. The test will start automatically after each question.
          </p>
        </Card>

        <Button variant="gradient" size="lg" onClick={startTest} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
          {loading ? "Loading questions..." : "Start Full Speaking Test"}
        </Button>

        <Button variant="outline" onClick={() => router.push("/speaking")} className="w-full">
          Back to Practice Options
        </Button>

        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;

  if (phase === "evaluating") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
        </div>
        <div className="max-w-md space-y-3">
          <h2 className="text-xl font-semibold">Analyzing your full speaking test...</h2>
          <p className="text-sm text-content-secondary">
            This may take 1-2 minutes. AI is transcribing all your answers and evaluating them holistically.
          </p>
          <p className="text-sm font-medium text-accent">
            O&apos;zbekcha: Barcha javoblaringiz tahlil qilinmoqda...
          </p>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    if (error) {
      return (
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <Card className="border-accent-red/40 p-6">
            <AlertCircle className="mx-auto h-10 w-10 text-accent-red" />
            <p className="mt-2 text-sm text-content-secondary">{error}</p>
          </Card>
          <Button variant="gradient" onClick={() => router.push("/speaking/full-test")}>
            Try Again
          </Button>
        </div>
      );
    }

    if (!feedback) {
      return (
        <div className="mx-auto max-w-xl text-center">
          <p className="text-content-secondary">Something went wrong. No feedback was received.</p>
          <Button variant="gradient" onClick={() => router.push("/speaking/full-test")} className="mt-4">
            Try Again
          </Button>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-accent-green" />
          <h2 className="text-xl font-semibold">Speaking Test Complete</h2>
        </div>
        <FullTestFeedbackView
          feedback={feedback}
          transcriptions={transcriptions}
          onPracticeAgain={() => router.push("/speaking/full-test")}
        />
      </div>
    );
  }

  // Active test phases: part1, part2-prep, part2-speak, part3
  const isPart2 = phase === "part2-prep" || phase === "part2-speak";
  const isPrep = phase === "part2-prep";
  const cueCardText = (() => {
    const q = part2Set?.questions?.[0];
    return typeof q === "string" ? q : q?.question;
  })();
  const totalQuestions = phase === "part1" ? (part1Set?.questions?.length ?? 0) : phase === "part3" ? (part3Set?.questions?.length ?? 0) : 1;
  const currentQ = qIndex + 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Speaking — {phase === "part1" ? "Part 1" : phase === "part2-prep" || phase === "part2-speak" ? "Part 2" : "Part 3"}
          </h1>
          <p className="text-sm text-content-secondary">
            Full Test &middot; {phase === "part1" || phase === "part3" ? `Question ${currentQ} of ${totalQuestions}` : "Cue Card"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-content-secondary">
          <Volume2 className="h-3 w-3" />
          {questionSpoken ? "Question asked" : "Asking question..."}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{
            width: `${phase === "part1"
              ? (currentQ / totalQuestions) * 33
              : phase === "part2-prep" || phase === "part2-speak"
              ? 50
              : 33 + 33 + ((currentQ / totalQuestions) * 34)
              }%`,
          }}
        />
      </div>

      {/* Question / Cue Card */}
      {isPart2 ? (
        <Card className="border-accent-yellow/50 bg-accent-yellow/5">
          <p className="text-xs font-semibold uppercase text-accent-yellow">Cue card — Part 2</p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{cueCardText}</p>
          {part2Set?.bullets && part2Set.bullets.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-content-secondary">
              {part2Set.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          )}
          {isPrep && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-content-secondary">Preparation time:</span>
              <Timer seconds={60} onElapsed={() => setPhase("part2-speak")} />
              <Button variant="outline" size="sm" onClick={() => setPhase("part2-speak")}>
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

      {/* Recorder */}
      {(!isPrep && questionSpoken) && (
        <Card>
          <AutoSpeakingRecorder
            key={`${phase}-${qIndex}`}
            isCueCard={phase === "part2-speak"}
            onComplete={handleRecorded}
          />
        </Card>
      )}

      {!questionSpoken && !isPrep && (
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
