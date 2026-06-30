"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Headphones } from "lucide-react";
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


export default function ListeningPage() {
  useTrialGuard("listening");
  const [mocks, setMocks] = useState<Mock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ mocks: Mock[] }>("/api/listening/mocks")
      .then((res) => setMocks(res.mocks || []))
      .catch(() => setMocks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Listening</h1>
        <p className="mt-1 text-content-secondary">
          Full IELTS Listening mock tests — 4 sections, 40 questions, with audio and instant scoring.
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : mocks.length === 0 ? (
        <p className="text-content-secondary">No listening tests found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {mocks.map((m) => (
            <Link key={m.id} href={`/listening/${m.slug}`}>
              <Card className="flex h-full flex-col items-start gap-3 p-4 transition-colors hover:border-accent/60">
                <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-accent/15 text-accent">
                  <Headphones className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{m.title}</p>
                  <p className="text-xs text-content-secondary">4 sections · 40 questions</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
