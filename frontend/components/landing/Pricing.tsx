"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

const fmtUZS = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

const plans = [
  {
    name: "1 OY",
    price: 49000,
    oldPrice: 98000,
    perDay: 1633,
    oldPerDay: 3266,
    badge: "✨ Sizga tavsiya etamiz",
    highlighted: true,
  },
  {
    name: "3 OY",
    price: 99000,
    oldPrice: 199000,
    perDay: 1100,
    oldPerDay: 2211,
    badge: null,
    highlighted: false,
  },
  {
    name: "12 OY",
    price: 399000,
    oldPrice: 999000,
    perDay: 1093,
    oldPerDay: 2737,
    badge: null,
    highlighted: false,
  },
];

const PRO_FEATURES = [
  "Cheksiz Writing baholash (AI examiner)",
  "Cheksiz Speaking amaliyot (jonli AI examiner)",
  "Cheksiz Mock testlar (Cambridge IELTS)",
  "To'liq band hisobotlari — 4 mezon bo'yicha",
  "Progress kuzatuvi va grafiklar",
  "Shaxsiy AI o'quv rejasi",
];

export function Pricing() {
  return (
    <section className="bg-slate-50 px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Narxlar</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
            O&apos;zingizga mos tarifni tanlang
          </h2>
          <div className="mt-4 flex items-center justify-center gap-1">
            <span aria-hidden>⭐⭐⭐⭐⭐</span>
            <span className="ml-1 text-sm text-slate-500">5 dan 4.9 · 1 847 ta sharh</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-8">
            <div>
              <p className="text-xl font-bold text-slate-900">🏆 12 000+</p>
              <p className="text-xs text-slate-500">foydalanuvchi tanlovi</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">⭐ 3 200+</p>
              <p className="text-xs text-slate-500">5 yulduzli baho</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">📈 92%</p>
              <p className="text-xs text-slate-500">band ko&apos;targanlar</p>
            </div>
          </div>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative overflow-hidden rounded-2xl border bg-white p-6 pt-8 shadow-sm ${
                plan.highlighted
                  ? "border-red-400 ring-1 ring-red-300"
                  : "border-slate-200"
              }`}
            >
              {plan.badge && (
                <span className="absolute inset-x-0 top-0 bg-red-500 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
              <p className="mt-2 text-sm">
                <span className="text-slate-400 line-through">{fmtUZS(plan.oldPrice)} so&apos;m</span>{" "}
                <span className="font-semibold text-slate-900">{fmtUZS(plan.price)} so&apos;m</span>
              </p>
              <div className="my-4 border-t border-slate-100" />
              <p className="text-3xl font-extrabold text-slate-900">
                {fmtUZS(plan.perDay)} so&apos;m <span className="text-sm font-normal text-slate-500">/kun</span>
              </p>
              <p className="text-sm text-slate-400 line-through">{fmtUZS(plan.oldPerDay)} so&apos;m</p>
              <Link href="/register" className="mt-6 block">
                <Button
                  className={`w-full ${
                    plan.highlighted
                      ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  Rejani olish
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
          <p className="mb-3 text-center font-semibold text-slate-900">Barcha tariflarga kiradi:</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PRO_FEATURES.map((feat) => (
              <li key={feat} className="flex items-center gap-2 text-sm text-slate-600">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                {feat}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-xs text-slate-500">
            Yoki bepul boshlang — ro&apos;yxatdan o&apos;ting va har bo&apos;limda 3 tadan bepul urinish oling.
          </p>
        </div>
      </div>
    </section>
  );
}
