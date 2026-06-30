"use client";

import { motion } from "framer-motion";
import { Brain, Zap, Shield, Globe } from "lucide-react";

const items = [
  {
    icon: Brain,
    title: "Gemini AI Engine",
    desc: "Powered by Google's Gemini AI — the same technology behind the world's most advanced language models. Get examiner-grade feedback on every skill.",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    icon: Zap,
    title: "Instant Results",
    desc: "No waiting for human tutors. Submit your essay or recording and receive detailed band scores, corrections, and improvement tips in under 15 seconds.",
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    icon: Shield,
    title: "Real Cambridge Materials",
    desc: "Every test comes from authentic Cambridge IELTS books. Practice with the same passages, questions, and audio that appear on the real exam.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: Globe,
    title: "Personalized Study Plan",
    desc: "Tell us your current level and target band. Our AI generates a custom weekly schedule with mock tests, skill drills, and vocabulary goals.",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
];

export function About() {
  return (
    <section className="bg-white px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Why IELTSUZ</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
            Built for serious IELTS candidates
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500">
            We combine real exam materials with cutting-edge AI to give you the most effective IELTS preparation experience online.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className={`shrink-0 rounded-xl ${item.bg} p-3 h-fit`}>
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
