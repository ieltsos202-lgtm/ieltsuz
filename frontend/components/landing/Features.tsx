"use client";

import { motion } from "framer-motion";
import { Headphones, BookOpen, PenLine, Mic } from "lucide-react";

import { MOCK_COUNTS } from "@/lib/constants";

const features = [
  {
    icon: Headphones,
    title: "Listening",
    desc: `Practice with Cambridge-style audio tests. ${MOCK_COUNTS.listening} full listening mocks with AI feedback on your answers.`,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "hover:border-indigo-300",
  },
  {
    icon: BookOpen,
    title: "Reading",
    desc: `Work through ${MOCK_COUNTS.reading} authentic reading passages. Build vocabulary and learn exam strategies.`,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "hover:border-violet-300",
  },
  {
    icon: PenLine,
    title: "Writing",
    desc: "Gemini AI examiner gives band-by-band analysis, sentence corrections, model answers, and vocabulary tips.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "hover:border-emerald-300",
  },
  {
    icon: Mic,
    title: "Speaking",
    desc: "Record your answers and get AI feedback on fluency, pronunciation, grammar, and vocabulary.",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "hover:border-amber-300",
  },
];

export function Features() {
  return (
    <section className="bg-slate-50 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Features</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
            Master every skill
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-500">
            All 4 IELTS skills in one smart platform that adapts to your level.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all ${f.border}`}
            >
              <div className={`mb-4 inline-flex rounded-xl ${f.bg} p-3`}>
                <f.icon className={`h-6 w-6 ${f.color}`} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
