"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Headphones, BookOpen, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MOCK_COUNTS, SKILL_COUNT } from "@/lib/constants";

function AnimatedBand() {
  const [value, setValue] = useState(5.0);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 2200;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(5.0 + eased * 3.0);
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent tabular-nums">{value.toFixed(1)}</span>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white px-6 pt-28 pb-20">
      <div className="pointer-events-none absolute -left-20 top-20 h-[400px] w-[400px] rounded-full bg-indigo-100 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-violet-100 blur-[100px]" />

      <div className="relative mx-auto max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700"
        >
          <Sparkles className="h-4 w-4 text-indigo-600" />
          AI-powered IELTS preparation
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-6xl"
        >
          Ace Your IELTS with{" "}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">AI That Knows You</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-slate-500"
        >
          Practice all 4 IELTS skills with instant AI feedback. Personalized study plans,
          real Cambridge tests, and band-score tracking — all in one place.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link href="/register">
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8">
              Start Free <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
          <a href="#how-it-works">
            <Button variant="outline" size="lg" className="border-slate-300 text-slate-700 hover:bg-slate-50">
              See How It Works
            </Button>
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-6"
        >
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Headphones className="h-6 w-6 text-indigo-600" />
            <p className="text-2xl font-bold text-slate-900">{MOCK_COUNTS.listening}</p>
            <p className="text-xs text-slate-500">Listening tests</p>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <BookOpen className="h-6 w-6 text-violet-600" />
            <p className="text-2xl font-bold text-slate-900">{MOCK_COUNTS.reading}</p>
            <p className="text-xs text-slate-500">Reading tests</p>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Mic className="h-6 w-6 text-emerald-600" />
            <p className="text-2xl font-bold text-slate-900">{SKILL_COUNT}</p>
            <p className="text-xs text-slate-500">AI-evaluated skills</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mx-auto mt-12 flex max-w-sm items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8"
        >
          <div className="text-left">
            <p className="text-sm text-slate-500">Example band progress</p>
            <p className="text-6xl font-extrabold">
              <AnimatedBand />
            </p>
            <p className="mt-1 text-xs text-slate-400">Track your real score on the dashboard</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
