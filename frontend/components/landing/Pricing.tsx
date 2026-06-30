"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Free",
    price: "0 UZS",
    period: "forever",
    features: [
      "3 Listening evaluations",
      "3 Reading evaluations",
      "3 Writing evaluations",
      "3 Speaking evaluations",
      "3 Mock tests",
      "AI study coach (limited)",
    ],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "49,000 UZS",
    period: "/month",
    features: [
      "Unlimited Listening practice",
      "Unlimited Reading practice",
      "Unlimited Writing evaluations (Gemini AI)",
      "Unlimited Speaking practice (Gemini AI)",
      "Unlimited Mock tests (Cambridge IELTS)",
      "Progress tracking & charts",
      "Vocabulary builder",
      "Personalized AI study plan",
    ],
    cta: "Get Pro",
    highlighted: true,
  },
];

export function Pricing() {
  return (
    <section className="bg-slate-50 px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Pricing</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-3 text-slate-500">
            Start free, upgrade when you need unlimited AI feedback and practice.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative rounded-2xl border p-8 bg-white shadow-sm ${
                plan.highlighted
                  ? "border-indigo-300 ring-1 ring-indigo-200"
                  : "border-slate-200"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 right-6 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                <span className="text-slate-500">{plan.period}</span>
              </div>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-3 text-sm text-slate-600">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block">
                <Button
                  className={`w-full ${
                    plan.highlighted
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
