"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

/** Redirect legacy full-test URL to the live AI examiner (ielts.gg style). */
export default function FullTestRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/speaking/partner?mode=exam");
  }, [router]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <LoadingSpinner />
      <p className="text-sm text-content-secondary">AI examiner test ochilmoqda...</p>
    </div>
  );
}
