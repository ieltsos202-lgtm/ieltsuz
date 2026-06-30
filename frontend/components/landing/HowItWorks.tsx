"use client";

import { motion } from "framer-motion";

const steps = [
  {
    n: "1",
    title: "Tell us about yourself",
    desc: "Share your name, current English level, and target IELTS band. We build a personalized roadmap.",
  },
  {
    n: "2",
    title: "Practice with real materials",
    desc: "Work through authentic Cambridge-style IELTS tests — listening audio, reading passages, writing prompts, and speaking questions.",
  },
  {
    n: "3",
    title: "Get instant AI feedback",
    desc: "Gemini AI analyzes every answer, essay, and recording. Get band scores, corrections, and tips in seconds.",
  },
  {
    n: "4",
    title: "Track & improve",
    desc: "Watch your band score climb with detailed progress charts, vocabulary tracking, and weekly study plans.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">How It Works</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
            Your IELTS success in 4 steps
          </h2>
        </div>
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-bold text-white shadow-lg shadow-indigo-200">
                {s.n}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center"
        >
          <p className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Authentic Cambridge IELTS Materials
          </p>
          <p className="mt-2 text-slate-500">
            Real exam conditions, real Cambridge books, real results.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
