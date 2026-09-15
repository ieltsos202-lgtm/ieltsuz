"use client";

import Link from "next/link";
import { useTrialGuard } from "@/hooks/useTrialGuard";
import { Mic, ArrowRight, GraduationCap, MessagesSquare } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpeakingProgressPanel } from "@/components/speaking/SpeakingProgressPanel";

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Speaking Practice</h1>
          <p className="mt-1 text-content-secondary">
            Haqiqiy AI examiner bilan jonli IELTS Speaking imtihoni — ielts.gg dan ham ilg&apos;or.
          </p>
        </div>
      </div>

      <SpeakingProgressPanel />

      {/* AI Speaking Examiner — primary (ielts.gg style) */}
      <Card className="flex flex-col items-center gap-4 border-accent/30 bg-gradient-to-r from-accent/10 to-accent-purple/10 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-purple text-2xl">
          🎓
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-lg font-semibold text-content-primary">
            AI Speaking Examiner — Full Mock Test
          </p>
          <p className="text-sm text-content-secondary">
            Adam haqiqiy IELTS test o&apos;tkazadi: Part 1 → Part 2 cue card → Part 3.
            Tabiiy odam ovozi, tez javob, oxirida to&apos;liq band hisobot.
          </p>
        </div>
        <Link href="/speaking/partner?mode=exam">
          <Button variant="gradient" size="lg">
            <GraduationCap className="mr-2 h-4 w-4" />
            Start Mock Test
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </Card>

      {/* Friendly chat — secondary */}
      <Card className="flex flex-col items-center gap-4 border-accent-purple/30 bg-gradient-to-r from-accent-purple/10 to-accent/5 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent text-2xl">
          🗣️
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-lg font-semibold text-content-primary">Friendly Chat with Adam</p>
          <p className="text-sm text-content-secondary">
            Do&apos;stingizdek gaplashadi, sizni eslab qoladi, har xatoni o&apos;zbekcha tushuntiradi —
            dangasa bo&apos;lsangiz koyadi ham.
          </p>
        </div>
        <Link href="/speaking/partner?mode=chat">
          <Button variant="outline" size="lg">
            <MessagesSquare className="mr-2 h-4 w-4" />
            Start Chat
          </Button>
        </Link>
      </Card>

      {/* Individual parts — tertiary */}
      <div>
        <p className="mb-3 text-sm font-medium text-content-secondary">
          Alohida qismlarni mashq qiling — Adam bilan, o&apos;sha jonli examiner rejimida
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {PARTS.map((p) => (
            <Card key={p.id} className="flex flex-col gap-4">
              <div>
                <p className="text-lg font-semibold">{p.title}</p>
                <p className="mt-1 text-sm text-content-secondary">{p.desc}</p>
              </div>
              <Link href={`/speaking/partner?mode=exam&part=${p.id}`} className="mt-auto">
                <Button variant="outline" size="sm" className="w-full">
                  <Mic className="mr-2 h-3.5 w-3.5" />
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
