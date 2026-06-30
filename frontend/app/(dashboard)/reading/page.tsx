"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useTrialGuard } from "@/hooks/useTrialGuard";

import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface Mock {
  id: string;
  title: string;
  slug: string;
  url: string;
}


export default function ReadingPage() {
  useTrialGuard("reading");
  const [mocks, setMocks] = useState<Mock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ mocks: Mock[] }>("/api/reading/mocks")
      .then((res) => setMocks(res.mocks || []))
      .catch(() => setMocks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reading</h1>
        <p className="mt-1 text-content-secondary">
          Full IELTS Academic Reading mock tests — 3 passages, 40 questions, with instant scoring.
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : mocks.length === 0 ? (
        <p className="text-content-secondary">No reading tests found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {mocks.map((m) => (
            <Link key={m.id} href={`/reading/${m.slug}`}>
              <Card className="flex h-full flex-col items-start gap-3 p-4 transition-colors hover:border-accent/60">
                <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-accent/15 text-accent">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{m.title}</p>
                  <p className="text-xs text-content-secondary">3 passages · 40 questions</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
