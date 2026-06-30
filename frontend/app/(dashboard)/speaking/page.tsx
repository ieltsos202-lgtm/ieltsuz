"use client";

import Link from "next/link";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import { Mic, ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PARTS = [
  {
    id: 1,
    title: "Part 1",
    desc: "Introduction & interview on familiar topics (home, family, work, hobbies). 5-6 short questions.",
  },
  {
    id: 2,
    title: "Part 2",
    desc: "Individual long turn. Speak for up to 2 minutes from a cue card after 1 minute of preparation.",
  },
  {
    id: 3,
    title: "Part 3",
    desc: "Two-way discussion. Deeper, more abstract questions related to the Part 2 topic.",
  },
];

export default function SpeakingPage() {
  useTrialGuard("speaking");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Speaking Practice</h1>
        <p className="mt-1 text-content-secondary">
          Record your answers and get AI feedback on fluency, vocabulary,
          grammar, and pronunciation.
        </p>
      </div>

      {/* Full Test — primary action */}
      <Card className="flex flex-col items-center gap-4 border-accent/20 bg-accent/5 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex-1 space-y-2">
          <p className="text-lg font-semibold text-content-primary">Full Speaking Test</p>
          <p className="text-sm text-content-secondary">
            Complete all 3 parts in one session (Part 1 → Part 2 → Part 3).
            Answers are recorded and evaluated together at the end for an overall band score.
          </p>
        </div>
        <Link href="/speaking/full-test">
          <Button variant="gradient" size="lg">
            <Mic className="mr-2 h-4 w-4" />
            Start Full Test
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </Card>

      {/* Individual parts — secondary */}
      <div>
        <p className="mb-3 text-sm font-medium text-content-secondary">Practice individual parts</p>
        <div className="grid gap-4 md:grid-cols-3">
          {PARTS.map((p) => (
            <Card key={p.id} className="flex flex-col gap-4">
              <div>
                <p className="text-lg font-semibold">{p.title}</p>
                <p className="mt-1 text-sm text-content-secondary">{p.desc}</p>
              </div>
              <Link href={`/speaking/${p.id}`} className="mt-auto">
                <Button variant="outline" size="sm" className="w-full">
                  Practice {p.title}
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
