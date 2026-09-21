"use client";

import Link from "next/link";
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Headphones,
  Library,
  Mic,
  NotebookPen,
  PenLine,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DailyBlock, HomeworkTask, PlanSkill } from "@/lib/dailyPlan";

const SKILL_ICON: Record<PlanSkill, LucideIcon> = {
  listening: Headphones,
  reading: BookOpen,
  writing: PenLine,
  speaking: Mic,
  vocabulary: Library,
  mock: ClipboardCheck,
};

const SKILL_COLOR: Record<PlanSkill, string> = {
  listening: "text-accent",
  reading: "text-accent-purple",
  writing: "text-accent-green",
  speaking: "text-accent-yellow",
  vocabulary: "text-accent",
  mock: "text-accent-red",
};

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 05:00 - 23:00

interface Props {
  dateLabel: string;
  blocks: DailyBlock[];
  homework: HomeworkTask[];
  doneIds: string[];
  startHour: number;
  onToggle: (id: string) => void;
  onStartHour: (hour: number) => void;
}

function TickBox({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? "Bajarilmagan deb belgilash" : "Bajarildi deb belgilash"}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all",
        done
          ? "border-accent-green bg-accent-green text-white"
          : "border-border hover:border-accent"
      )}
    >
      {done && <Check className="h-4 w-4" strokeWidth={3} />}
    </button>
  );
}

export function TodayPlan({
  dateLabel,
  blocks,
  homework,
  doneIds,
  startHour,
  onToggle,
  onStartHour,
}: Props) {
  const total = blocks.length + homework.length;
  const doneCount = [...blocks, ...homework].filter((x) => doneIds.includes(x.id)).length;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;
  const totalMinutes = blocks.reduce((sum, b) => sum + b.minutes, 0);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Bugungi reja</h2>
            <p className="text-sm text-content-secondary">
              {dateLabel} · jami {Math.floor(totalMinutes / 60)} soat {totalMinutes % 60} daqiqa
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-content-secondary">
            Boshlash vaqti
            <select
              value={startHour}
              onChange={(e) => onStartHour(Number(e.target.value))}
              className="rounded-lg border border-border bg-bg-tertiary px-2 py-1.5 text-sm font-medium text-content-primary outline-none focus:border-accent"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Daily progress */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-content-secondary">
              {doneCount} / {total} bajarildi
            </span>
            <span className="font-semibold text-accent-green">{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-accent-green transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Timetable */}
        <div className="mt-5 space-y-2">
          {blocks.map((b) => {
            const Icon = SKILL_ICON[b.skill];
            const done = doneIds.includes(b.id);
            return (
              <div
                key={b.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                  done
                    ? "border-accent-green/30 bg-accent-green/5"
                    : "border-border bg-bg-tertiary/40"
                )}
              >
                <TickBox done={done} onClick={() => onToggle(b.id)} />

                <div className="w-[88px] shrink-0 text-center">
                  <p className="text-sm font-bold text-content-primary">{b.start}</p>
                  <p className="text-[10px] text-content-secondary">{b.end} gacha</p>
                </div>

                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-secondary sm:flex">
                  <Icon className={cn("h-5 w-5", SKILL_COLOR[b.skill])} />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold",
                      done && "text-content-secondary line-through"
                    )}
                  >
                    {b.title}
                  </p>
                  <p className="truncate text-xs text-content-secondary">{b.desc}</p>
                </div>

                <Link href={b.href} className="shrink-0">
                  <Button variant="outline" size="sm">
                    {done ? "Qayta" : "Boshlash"}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Homework */}
      <Card className="border-accent-purple/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-purple/15">
            <NotebookPen className="h-5 w-5 text-accent-purple" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Uyga vazifa</h2>
            <p className="text-sm text-content-secondary">
              Bugun topshirishingiz kerak — AI tekshirib baho qo&apos;yadi
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {homework.map((t) => {
            const done = doneIds.includes(t.id);
            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                  done
                    ? "border-accent-green/30 bg-accent-green/5"
                    : "border-border bg-bg-tertiary/40"
                )}
              >
                <TickBox done={done} onClick={() => onToggle(t.id)} />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      done && "text-content-secondary line-through"
                    )}
                  >
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-xs text-content-secondary">{t.desc}</p>
                  <p className="mt-1 text-[10px] text-content-secondary">
                    ⏱ ~{t.minutes} daqiqa
                  </p>
                </div>
                <Link href={t.href} className="shrink-0">
                  <Button variant="outline" size="sm">
                    Bajarish
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
