"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrialGuard } from "@/hooks/useTrialGuard";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function WritingPage() {
  useTrialGuard("writing");
  const router = useRouter();
  const [taskType, setTaskType] = useState<"task1" | "task2">("task2");

  const start = () => {
    router.push(`/writing/${taskType}?source=ai`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Writing Practice</h1>
        <p className="mt-1 text-content-secondary">
          Choose a task, then write your essay for instant AI feedback.
        </p>
      </div>

      <Card className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">Task</p>
          <div className="flex gap-2">
            {(["task1", "task2"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTaskType(t)}
                className={cn(
                  "flex-1 rounded-[var(--radius)] border py-2.5 text-sm font-semibold transition-colors",
                  taskType === t
                    ? "border-accent bg-accent/15"
                    : "border-border bg-bg-tertiary text-content-secondary hover:border-accent/40"
                )}
              >
                {t === "task1" ? "Task 1" : "Task 2"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-content-secondary">
            {taskType === "task1"
              ? "Describe visual information in at least 150 words (20 min)."
              : "Write an essay in response to an argument in at least 250 words (40 min)."}
          </p>
        </div>

        <Button variant="gradient" size="lg" className="w-full" onClick={start}>
          Start Writing
        </Button>
      </Card>
    </div>
  );
}
