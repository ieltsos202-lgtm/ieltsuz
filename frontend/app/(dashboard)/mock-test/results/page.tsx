"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Headphones, BookOpen, PenLine, Mic, Trophy, ArrowRight } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedBand } from "@/components/shared/AnimatedBand";
import { RadarChart } from "@/components/dashboard/RadarChart";
import type { Skill } from "@/lib/types";

const STAGES = [
  { key: "speaking" as Skill, label: "Speaking", icon: Mic },
  { key: "listening" as Skill, label: "Listening", icon: Headphones },
  { key: "reading" as Skill, label: "Reading", icon: BookOpen },
  { key: "writing" as Skill, label: "Writing", icon: PenLine },
];

export default function MockTestResultsPage() {
  const router = useRouter();
  const [bands, setBands] = useState<Record<string, number | null>>({});
  const [overallBand, setOverallBand] = useState<number>(0);

  useEffect(() => {
    const mockData = JSON.parse(localStorage.getItem('mock_test_data') || '{}');
    setBands({
      speaking: mockData.speaking_band || null,
      listening: mockData.listening_band || null,
      reading: mockData.reading_band || null,
      writing: mockData.writing_band || null,
    });

    // Calculate overall band (average of 4 skills)
    const values = [
      mockData.speaking_band,
      mockData.listening_band,
      mockData.reading_band,
      mockData.writing_band,
    ].filter(Boolean) as number[];

    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      setOverallBand(Math.round(avg * 2) / 2);
    }
  }, []);

  const newTest = () => {
    localStorage.removeItem('mock_test_mode');
    localStorage.removeItem('mock_test_data');
    router.push('/mock-test');
  };

  const radar = STAGES.map((s) => ({
    skill: s.label,
    current: bands[s.key] ?? 0,
    target: 7, // Default target
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="flex flex-col items-center bg-gradient-to-b from-accent/15 to-bg-secondary py-8">
        <Trophy className="mb-2 h-8 w-8 text-accent-yellow" />
        <p className="text-sm text-content-secondary">Overall Band</p>
        <AnimatedBand target={overallBand} className="text-6xl" />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {STAGES.map((s) => (
          <Card key={s.key} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <s.icon className="h-4 w-4 text-accent" /> {s.label}
            </span>
            <span className="text-xl font-bold tabular-nums">
              {bands[s.key]?.toFixed(1) ?? "—"}
            </span>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Skill Breakdown</CardTitle>
        <RadarChart data={radar} />
      </Card>

      <div className="flex flex-col gap-3">
        <Button variant="gradient" size="lg" className="w-full" onClick={newTest}>
          Start New Mock Test <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="outline" className="w-full" onClick={() => router.push('/progress')}>
          View Progress History
        </Button>
      </div>
    </div>
  );
}
