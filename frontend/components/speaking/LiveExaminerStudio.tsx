"use client";

import { useEffect, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Mic,
  Loader2,
  Sparkles,
  ArrowLeft,
  Lightbulb,
  GraduationCap,
  MessagesSquare,
  FileText,
  Award,
  Timer,
  Zap,
  Volume2,
  Laugh,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExaminerFace } from "./ExaminerFace";

export type StudioEmotion =
  | "happy"
  | "laughing"
  | "excited"
  | "neutral"
  | "thinking"
  | "surprised"
  | "sad"
  | "annoyed"
  | "encouraging";

export type StudioPhase =
  | "intro"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "prep"
  | "report_loading"
  | "report";

export type StudioMode = "chat" | "exam";

export interface StudioCorrection {
  you_said: string;
  better: string;
  note: string;
}

export interface StudioVocabTip {
  instead_of: string;
  try: string;
  example: string;
}

export interface StudioTurn {
  role: "user" | "partner";
  text: string;
  emotion?: StudioEmotion;
  correction?: StudioCorrection | null;
  vocab_tip?: StudioVocabTip | null;
}

export interface StudioCueCard {
  topic: string;
  bullets: string[];
}

export interface StudioReport {
  overall_band: number;
  criteria: Record<
    string,
    { band: number; evidence: string[]; signal_available?: boolean }
  >;
  strengths: string[];
  priority_fixes: string[];
  l1_interference_notes: string[];
  corrected_examples: { said: string; better: string; why: string }[];
  examiner_summary: string;
  metrics?: {
    words: number;
    speaking_seconds: number;
    words_per_minute: number;
    words_per_answer: number;
    filler_count: number;
    filler_rate: number;
    vocabulary_diversity: number;
    overused_words: string[];
    answers: number;
  };
}

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: "Part 1 · Interview",
  2: "Part 2 · Cue Card",
  3: "Part 3 · Discussion",
};

function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-accent/20 blur-[120px]" />
      <div className="absolute -right-1/4 top-1/3 h-[400px] w-[400px] rounded-full bg-accent-purple/20 blur-[100px]" />
      <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-cyan-500/10 blur-[90px]" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}

export function VoiceOrb({
  phase,
  emotion,
  micLevel = 0,
  partnerName,
  mode,
  compact = false,
}: {
  phase: StudioPhase;
  emotion: StudioEmotion;
  micLevel?: number;
  partnerName: string;
  mode: StudioMode;
  compact?: boolean;
}) {
  const ringBase = compact ? 168 : 280;
  const ringStep = compact ? 24 : 36;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center transition-all duration-300",
        compact ? "h-48 w-48" : "h-80 w-80"
      )}
    >
      {/* Outer orbit rings */}
      {[1, 2, 3].map((ring) => (
        <motion.div
          key={ring}
          className={cn(
            "absolute rounded-full border border-white/10",
            phase === "speaking" && "border-white/20"
          )}
          style={{ width: ringBase + ring * ringStep, height: ringBase + ring * ringStep }}
          animate={{
            rotate: phase === "thinking" ? 360 : 0,
            opacity: phase === "idle" ? 0.3 : 0.6,
          }}
          transition={{
            rotate: phase === "thinking" ? { duration: 8 + ring * 2, repeat: Infinity, ease: "linear" } : { duration: 0.4 },
            opacity: { duration: 0.4 },
          }}
        />
      ))}

      {/* Speaking pulse */}
      {phase === "speaking" && (
        <>
          <motion.div
            className={cn("absolute rounded-full bg-white/5", compact ? "h-36 w-36" : "h-64 w-64")}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
          <motion.div
            className={cn("absolute rounded-full border border-white/15", compact ? "h-40 w-40" : "h-72 w-72")}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
        </>
      )}

      {/* Core: animated face */}
      <ExaminerFace phase={phase} emotion={emotion} micLevel={micLevel} size={compact ? 136 : 224} />

      <span className="absolute -bottom-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
        {partnerName} · {mode === "exam" ? "Examiner" : "Mentor"}
      </span>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-accent/70"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function StudioIntro({
  partnerName,
  onStartChat,
  onStartExam,
  onBack,
  error,
}: {
  partnerName: string;
  onStartChat: () => void;
  onStartExam: () => void;
  onBack: () => void;
  error: string | null;
}) {
  const features = [
    { icon: Laugh, text: "Sizni eslab qoladi — har safar boshqacha kutib oladi" },
    { icon: Zap, text: "Gapiring — jim tursangiz o'zi yuboradi, yoki tugmani bosing" },
    { icon: Volume2, text: "Har gapingizni tahlil qiladi, xatoni o'zbekcha tushuntiradi" },
    { icon: Award, text: "Oxirida to'liq IELTS band hisoboti" },
  ];

  return (
    <div className="relative min-h-[80vh]">
      <AuroraBackground />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              "border border-accent/30 bg-accent/10 text-accent"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> ielts.gg dan ham ilg'or
          </span>
          <h1 className="mt-4 bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            {partnerName} bilan gaplashing
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-content-secondary sm:text-lg">
            Haqiqiy odamdek gaplashadi, kuladi, jahli chiqadi, koyadi — va sizni band 7+ ga olib chiqadi.
          </p>
        </motion.div>

        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
          <VoiceOrb phase="idle" emotion="happy" partnerName={partnerName} mode="chat" />
        </motion.div>

        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
            >
              <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <p className="text-sm text-content-secondary">{f.text}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStartChat}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-accent-purple/20 to-transparent p-6 text-left backdrop-blur-xl transition-shadow hover:shadow-xl hover:shadow-accent-purple/20"
          >
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-accent-purple/20 blur-2xl transition-all group-hover:bg-accent-purple/30" />
            <MessagesSquare className="relative mb-3 h-9 w-9 text-accent-purple" />
            <p className="relative text-xl font-bold">Friendly Chat</p>
            <p className="relative mt-2 text-sm text-content-secondary">
              Do&apos;stingizdek gaplashadi, xatoni darrov tuzatadi, dangasa bo&apos;lsangiz koyadi.
            </p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStartExam}
            className="group relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/20 to-transparent p-6 text-left backdrop-blur-xl transition-shadow hover:shadow-xl hover:shadow-accent/25"
          >
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-accent/25 blur-2xl transition-all group-hover:bg-accent/35" />
            <GraduationCap className="relative mb-3 h-9 w-9 text-accent" />
            <p className="relative text-xl font-bold">
              Mock Exam
              <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                Real IELTS
              </span>
            </p>
            <p className="relative mt-2 text-sm text-content-secondary">
              Part 1 → 2 → 3. Haqiqiy examiner ovozi. Oxirida band report.
            </p>
          </motion.button>
        </div>

        <Button variant="ghost" onClick={onBack} className="text-content-secondary">
          <ArrowLeft className="mr-2 h-4 w-4" /> Orqaga
        </Button>
        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>
    </div>
  );
}

export function StudioTranscript({
  turns,
  phase,
  chatEndRef,
}: {
  turns: StudioTurn[];
  phase: StudioPhase;
  chatEndRef: RefObject<HTMLDivElement>;
}) {
  // Only the examiner's lines are shown — the candidate's own speech is never
  // written out, so the screen stays a clean list of Adam's questions.
  const partnerTurns = turns.filter((t) => t.role === "partner");

  // Auto-scroll inside this box only — never the page — so new lines slide
  // into view by themselves while the controls stay put.
  useEffect(() => {
    const box = chatEndRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [partnerTurns.length, phase, chatEndRef]);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl sm:p-5">
      <AnimatePresence initial={false}>
        {partnerTurns.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex justify-start"
          >
            <div className="max-w-[88%] space-y-2">
              <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-2.5 text-sm leading-relaxed text-content-primary shadow-lg backdrop-blur-sm">
                {t.text}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {phase === "thinking" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
          <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 backdrop-blur-sm">
            <TypingDots />
          </div>
        </motion.div>
      )}
      <div ref={chatEndRef} />
    </div>
  );
}

export function StudioSession({
  partnerName,
  mode,
  phase,
  emotion,
  micLevel,
  micHint = null,
  turns,
  examPart,
  onlyPart = null,
  cueCard,
  prepSeconds,
  seconds,
  error,
  chatEndRef,
  onInterrupt,
  onSkipPrep,
  onGenerateReport,
  onExit,
  onResume,
  onDone,
  userAnswerCount,
  fmt,
  live = false,
}: {
  partnerName: string;
  mode: StudioMode;
  live?: boolean;
  phase: StudioPhase;
  emotion: StudioEmotion;
  micLevel: number;
  micHint?: string | null;
  turns: StudioTurn[];
  examPart: 1 | 2 | 3;
  onlyPart?: 1 | 2 | 3 | null;
  cueCard: StudioCueCard | null;
  prepSeconds: number;
  seconds: number;
  error: string | null;
  chatEndRef: RefObject<HTMLDivElement>;
  onInterrupt: () => void;
  onSkipPrep: () => void;
  onGenerateReport: () => void;
  onExit: () => void;
  onResume: () => void;
  onDone: () => void;
  userAnswerCount: number;
  fmt: (s: number) => string;
}) {
  const statusText =
    phase === "listening"
      ? mode === "exam" && examPart === 2
        ? "Speak for 1–2 minutes"
        : "Listening…"
      : phase === "thinking"
      ? "…"
      : phase === "speaking"
      ? ""
      : phase === "prep"
      ? "Preparation"
      : "Paused";

  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const liveCorrection = lastUser?.correction ?? null;
  const lastPartner = [...turns].reverse().find((t) => t.role === "partner");

  const hasTurns = turns.length > 0;

  return (
    // Fixed-height app layout: everything stays on screen, only the
    // transcript scrolls. 7rem = dashboard header (4rem) + main padding (3rem).
    <div className="relative flex h-[calc(100dvh-7rem)] flex-col">
      <AuroraBackground />
      <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-3">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {live && (
              <span className="flex items-center gap-1.5 rounded-full bg-accent-red/20 px-3 py-1 text-xs font-semibold text-accent-red">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-red" />
                LIVE
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                mode === "exam"
                  ? "bg-accent/20 text-accent"
                  : "bg-accent-purple/20 text-accent-purple"
              )}
            >
              {mode === "exam" ? (onlyPart ? `Part ${onlyPart} Drill` : "Mock Exam") : "Friendly Chat"}
            </span>
            {phase === "listening" && (
              <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-accent-red">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-red" />
                {fmt(seconds)}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onExit} className="text-content-secondary">
            <ArrowLeft className="mr-1 h-4 w-4" /> Chiqish
          </Button>
        </div>

        {/* Exam progress */}
        {mode === "exam" && (
          <div className="flex justify-center gap-2">
            {([1, 2, 3] as const).filter((p) => !onlyPart || p === onlyPart).map((p) => (
              <span
                key={p}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-all",
                  examPart === p
                    ? "bg-accent text-white shadow-lg shadow-accent/30"
                    : examPart > p
                    ? "bg-accent/15 text-accent"
                    : "bg-white/5 text-content-secondary"
                )}
              >
                {PART_LABELS[p]}
              </span>
            ))}
          </div>
        )}

        {/* Orb — shrinks once the conversation starts so the transcript and
            controls fit on screen together */}
        <div
          className={cn(
            "flex flex-col items-center",
            hasTurns ? "shrink-0 gap-2 py-1" : "flex-1 justify-center gap-4 py-4"
          )}
        >
          <button
            onClick={phase === "idle" ? onResume : onInterrupt}
            className={cn((phase === "speaking" || phase === "idle") && "cursor-pointer")}
            aria-label={phase === "idle" ? "Resume" : "Interrupt"}
          >
            <VoiceOrb
              phase={phase}
              emotion={emotion}
              micLevel={micLevel}
              partnerName={partnerName}
              mode={mode}
              compact={hasTurns}
            />
          </button>
          <div className="flex h-6 items-center gap-2 text-sm font-medium text-content-secondary">
            {phase === "thinking" && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
            {phase === "listening" && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent-red" />
            )}
            {statusText}
          </div>

          {/* Mic level — lets the learner see the mic is actually picking them up */}
          {phase === "listening" && (
            <div className="flex h-3 items-end gap-[3px]" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => {
                const active = micLevel * 60 > i;
                return (
                  <span
                    key={i}
                    className={cn(
                      "w-1 rounded-full transition-all duration-75",
                      active ? "bg-accent" : "bg-white/10"
                    )}
                    style={{ height: active ? `${6 + i * 0.5}px` : "4px" }}
                  />
                );
              })}
            </div>
          )}
          {micHint && (
            <p className="max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-200">
              {micHint}
            </p>
          )}

          {/* Live caption: what the examiner is saying / asked */}
          <AnimatePresence mode="wait">
            {lastPartner && (
              <motion.div
                key={turns.lastIndexOf(lastPartner)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="max-w-xl rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center backdrop-blur-xl"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                  {partnerName}
                </p>
                <p className="mt-1 text-base font-medium leading-relaxed text-content-primary sm:text-lg">
                  {lastPartner.text}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {liveCorrection && (phase === "speaking" || phase === "listening" || phase === "thinking") && (
              <motion.div
                key={liveCorrection.you_said}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm backdrop-blur-xl"
              >
                <span className="text-accent-red line-through">{liveCorrection.you_said}</span>{" "}
                → <span className="font-semibold text-accent-green">{liveCorrection.better}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Cue card */}
        {mode === "exam" && cueCard && examPart === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-h-[32vh] shrink-0 overflow-y-auto rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-5 backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-semibold">{cueCard.topic}</p>
              {phase === "prep" && (
                <span className="flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 font-mono text-sm tabular-nums text-accent">
                  <Timer className="h-4 w-4" /> {fmt(prepSeconds)}
                </span>
              )}
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-content-secondary">
              You should say:
            </p>
            <ul className="space-y-1 text-sm text-content-secondary">
              {cueCard.bullets.map((b, i) => (
                <li key={i}>• {b}</li>
              ))}
            </ul>
            {phase === "prep" && (
              <Button variant="gradient" size="sm" className="mt-4 w-full" onClick={onSkipPrep}>
                <Mic className="mr-2 h-4 w-4" /> Tayyorman — boshlayman
              </Button>
            )}
          </motion.div>
        )}

        {/* Full transcript — takes the leftover space and scrolls internally */}
        {hasTurns && (
          <StudioTranscript turns={turns} phase={phase} chatEndRef={chatEndRef} />
        )}

        {error && <p className="shrink-0 text-center text-sm text-accent-red">{error}</p>}

        {/* Footer: pinned to the bottom, always reachable */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-2 pb-2">
          {phase === "listening" &&
            (live ? (
              <p className="text-xs text-content-secondary">
                Gapiring — Adam o&apos;zi eshitadi va javob beradi
              </p>
            ) : (
              <>
                <Button variant="gradient" size="lg" onClick={onDone} className="px-8">
                  <Check className="mr-2 h-5 w-5" /> Javobni tugatdim
                </Button>
                <p className="text-xs text-content-secondary">
                  yoki jim turing — {mode === "exam" && examPart === 2 ? "~2.5s" : "~1.5s"} da o&apos;zi yuboradi
                </p>
              </>
            ))}
          <div className="flex items-center justify-center gap-3">
          {phase === "idle" && (
            <Button variant="gradient" size="sm" onClick={onResume}>
              <Mic className="mr-2 h-4 w-4" /> Davom etish
            </Button>
          )}
          {userAnswerCount >= 2 && phase !== "thinking" && (
            <Button variant="outline" size="sm" onClick={onGenerateReport} className="border-white/10 bg-white/5">
              <FileText className="mr-2 h-4 w-4" /> Hisobot
            </Button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BandRing({ label, band, maxBand = 9 }: { label: string; band: number; maxBand?: number }) {
  const pct = (band / maxBand) * 100;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-20 w-20">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray={`${pct} 100`}
            strokeLinecap="round"
            className="text-accent"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{band.toFixed(1)}</span>
        </div>
      </div>
      <p className="text-center text-xs font-medium text-content-secondary">{label}</p>
    </div>
  );
}

export function StudioReportView({
  report,
  partnerName,
  onNewSession,
  onBack,
}: {
  report: StudioReport;
  partnerName: string;
  onNewSession: () => void;
  onBack: () => void;
}) {
  const criteria = [
    { key: "fluency_coherence", label: "Fluency" },
    { key: "lexical_resource", label: "Vocabulary" },
    { key: "grammatical_range", label: "Grammar" },
    { key: "pronunciation", label: "Pronunciation" },
  ];

  return (
    <div className="relative min-h-[80vh]">
      <AuroraBackground />
      <div className="relative mx-auto max-w-3xl space-y-6 px-4 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <Award className="h-12 w-12 text-accent" />
          <h1 className="text-3xl font-bold">Speaking Hisobotingiz</h1>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-accent via-accent-purple to-fuchsia-500 text-white shadow-2xl shadow-accent/40"
          >
            <div>
              <p className="text-5xl font-bold leading-none">{report.overall_band.toFixed(1)}</p>
              <p className="mt-1 text-xs uppercase tracking-wider opacity-80">Band</p>
            </div>
          </motion.div>
          <p className="text-sm text-content-secondary">{partnerName} tomonidan tahlil qilindi</p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {criteria.map((c) => {
            const data = report.criteria[c.key];
            if (!data) return null;
            return (
              <div
                key={c.key}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
              >
                <BandRing label={c.label} band={data.band} />
              </div>
            );
          })}
        </div>

        {report.metrics && report.metrics.words > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <p className="mb-3 font-semibold">O&apos;lchangan ko&apos;rsatkichlar</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Tezlik",
                  value: report.metrics.words_per_minute
                    ? `${report.metrics.words_per_minute} so'z/daq`
                    : "—",
                },
                { label: "Jami so'z", value: String(report.metrics.words) },
                {
                  label: "Filler",
                  value: `${report.metrics.filler_count} (${report.metrics.filler_rate}%)`,
                },
                {
                  label: "Lug'at xilma-xilligi",
                  value: `${Math.round(report.metrics.vocabulary_diversity * 100)}%`,
                },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-white/5 p-3 text-center">
                  <p className="text-lg font-semibold">{m.value}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-content-secondary">
                    {m.label}
                  </p>
                </div>
              ))}
            </div>
            {report.metrics.overused_words.length > 0 && (
              <p className="mt-3 text-sm text-content-secondary">
                Ko&apos;p takrorlangan so&apos;zlar: {report.metrics.overused_words.join(", ")}
              </p>
            )}
          </div>
        )}

        {report.examiner_summary && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-accent" /> Examiner xulosasi
            </p>
            <p className="text-sm leading-relaxed text-content-secondary">{report.examiner_summary}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
            <p className="mb-2 font-semibold text-accent-green">Kuchli tomonlar</p>
            {report.strengths.map((s, i) => (
              <p key={i} className="text-sm text-content-secondary">• {s}</p>
            ))}
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur-xl">
            <p className="mb-2 font-semibold text-accent-yellow">Yaxshilash kerak</p>
            {report.priority_fixes.map((s, i) => (
              <p key={i} className="text-sm text-content-secondary">• {s}</p>
            ))}
          </div>
        </div>

        {report.l1_interference_notes.length > 0 && (
          <div className="rounded-2xl border border-accent/25 bg-accent/5 p-5 backdrop-blur-xl">
            <p className="font-semibold">🇺🇿 O&apos;zbek/rus tili ta&apos;siri</p>
            {report.l1_interference_notes.map((s, i) => (
              <p key={i} className="mt-1 text-sm text-content-secondary">• {s}</p>
            ))}
          </div>
        )}

        {report.corrected_examples.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <p className="font-semibold">Tuzatilgan misollar</p>
            {report.corrected_examples.map((g, i) => (
              <div key={i} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm">
                <span className="text-accent-red line-through">{g.said}</span> →{" "}
                <span className="text-accent-green">{g.better}</span>
                <p className="mt-0.5 text-xs text-content-secondary">{g.why}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="gradient" className="flex-1" onClick={onNewSession}>
            <Sparkles className="mr-2 h-4 w-4" /> Yangi sessiya
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Orqaga
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StudioLoading({ partnerName }: { partnerName: string }) {
  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <AuroraBackground />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-14 w-14 animate-spin text-accent" />
        <p className="text-xl font-semibold">Tahlil qilinmoqda...</p>
        <p className="max-w-sm text-sm text-content-secondary">
          {partnerName} barcha javoblaringizni ko&apos;rib chiqmoqda — bu 1 daqiqadan kam vaqt oladi.
        </p>
      </div>
    </div>
  );
}

export function StudioUpgrade() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <p className="text-lg font-semibold">Speaking limitingiz tugadi</p>
        <p className="mt-2 text-sm text-content-secondary">
          Jonli suhbatni davom ettirish uchun Pro&apos;ga o&apos;ting.
        </p>
        <Link href="/upgrade">
          <Button variant="gradient" className="mt-4 w-full">
            Upgrade to Pro
          </Button>
        </Link>
      </div>
    </div>
  );
}
