"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
        IELTSUZ
      </p>

      <div className="mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>

      <h1 className="mt-6 text-xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        An unexpected error occurred. Please try again — if the problem continues, contact support.
      </p>

      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={() => reset()} className="border-slate-200 text-slate-700">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Link href="/dashboard">
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
            <Home className="mr-2 h-4 w-4" />
            Go to dashboard
          </Button>
        </Link>
      </div>
    </main>
  );
}
