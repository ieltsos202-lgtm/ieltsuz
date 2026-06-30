"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useTrialGuard } from "@/hooks/useTrialGuard";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STAGES = [
  "Listening — 30 minutes",
  "Reading — 60 minutes",
  "Writing — 60 minutes",
  "Speaking — 15 minutes",
];

export default function MockTestPage() {
  useTrialGuard("mock");
  const router = useRouter();

  const startMockTest = () => {
    // Enable mock test mode
    localStorage.setItem('mock_test_mode', 'true');
    localStorage.setItem('mock_test_data', JSON.stringify({}));
    // Auto-generate a random test ID
    const randomTestId = Math.floor(Math.random() * 1000) + 1;
    router.push(`/mock-test/${randomTestId}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mock Test</h1>
        <p className="mt-1 text-content-secondary">
          A full IELTS exam under real conditions across all four skills.
        </p>
      </div>

      <Card className="space-y-5">
        <ol className="space-y-2">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-[var(--radius)] bg-bg-tertiary px-4 py-2.5 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>

        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-accent-yellow/40 bg-accent-yellow/5 p-3 text-sm text-content-secondary">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-yellow" />
          This is a full IELTS exam — about 2 hours 45 minutes. Set aside
          uninterrupted time.
        </div>

        <Button
          variant="gradient"
          size="lg"
          className="w-full"
          onClick={startMockTest}
        >
          I&apos;m Ready — Start Mock Test
        </Button>
      </Card>
    </div>
  );
}
