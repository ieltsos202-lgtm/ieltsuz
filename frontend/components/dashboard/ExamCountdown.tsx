"use client";

import { useState } from "react";
import { CalendarDays, Clock, Flame, Target } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateUz } from "@/lib/dailyPlan";
import type { StudyPlan } from "@/lib/types";

interface Props {
  firstName: string;
  examDate: string | null;
  daysLeft: number | null;
  plan: StudyPlan | null;
  streak: number;
  onSaveExamDate: (date: string) => Promise<void>;
}

function formatUz(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return formatDateUz(d);
}

export function ExamCountdown({
  firstName,
  examDate,
  daysLeft,
  plan,
  streak,
  onSaveExamDate,
}: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const dailyHours = plan?.daily_study_hours ?? 2;
  const target = (plan?.target_band ?? 6.5).toFixed(1);
  const current = plan?.current_band_estimate ?? 0;
  const progress = Math.min(Math.round((current / (plan?.target_band || 6.5)) * 100), 100);
  const totalHours = daysLeft && daysLeft > 0 ? daysLeft * dailyHours : null;

  const save = async () => {
    if (!value) return;
    setSaving(true);
    try {
      await onSaveExamDate(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent/15 via-accent-purple/10 to-transparent">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Salom, {firstName}! 👋</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Maqsad: <span className="font-semibold text-content-primary">Band {target}</span>
            {" · "}Hozirgi daraja: {current.toFixed(1)}
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-accent-yellow/15 px-3 py-1.5">
            <Flame className="h-4 w-4 text-accent-yellow" />
            <span className="text-sm font-semibold text-accent-yellow">
              {streak} kun ketma-ket
            </span>
          </div>
        )}
      </div>

      {/* Band progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-content-secondary">
          <span>Maqsadga yaqinlik</span>
          <span className="font-semibold text-accent">{progress}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-purple transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {examDate && daysLeft !== null && !editing ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-bg-secondary/70 p-4 text-center">
            <CalendarDays className="mx-auto h-5 w-5 text-accent" />
            <p className="mt-1.5 text-2xl font-extrabold text-accent">
              {daysLeft > 0 ? daysLeft : 0}
            </p>
            <p className="text-[11px] text-content-secondary">kun qoldi</p>
          </div>
          <div className="rounded-xl bg-bg-secondary/70 p-4 text-center">
            <Clock className="mx-auto h-5 w-5 text-accent-purple" />
            <p className="mt-1.5 text-2xl font-extrabold text-accent-purple">{dailyHours} soat</p>
            <p className="text-[11px] text-content-secondary">har kuni</p>
          </div>
          <div className="rounded-xl bg-bg-secondary/70 p-4 text-center">
            <Target className="mx-auto h-5 w-5 text-accent-green" />
            <p className="mt-1.5 text-2xl font-extrabold text-accent-green">
              {totalHours ?? 0}
            </p>
            <p className="text-[11px] text-content-secondary">jami soat qoldi</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setValue(examDate);
              setEditing(true);
            }}
            className="rounded-xl bg-bg-secondary/70 p-4 text-center transition-colors hover:bg-bg-tertiary"
          >
            <CalendarDays className="mx-auto h-5 w-5 text-accent-yellow" />
            <p className="mt-1.5 text-sm font-bold text-accent-yellow">{formatUz(examDate)}</p>
            <p className="text-[11px] text-content-secondary">imtihon kuni · o&apos;zgartirish</p>
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-accent-yellow/40 bg-accent-yellow/5 p-4">
          <p className="text-sm font-semibold text-accent-yellow">
            {editing ? "Imtihon sanasini o'zgartirish" : "Imtihon sanangizni kiriting"}
          </p>
          <p className="mt-1 text-xs text-content-secondary">
            Sanani kiritsangiz, necha kun qolganini va kuniga qancha soat o&apos;qishingiz
            kerakligini aniq hisoblab beramiz.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="sm:max-w-[200px]"
            />
            <Button onClick={save} disabled={!value || saving} variant="gradient">
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Bekor qilish
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
