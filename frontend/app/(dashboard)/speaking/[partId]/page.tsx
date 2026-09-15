"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

/** Legacy per-part drill URL → the live Adam examiner, limited to that part. */
export default function SpeakingPartRedirectPage() {
  const router = useRouter();
  const params = useParams<{ partId: string }>();

  useEffect(() => {
    const part = ["1", "2", "3"].includes(params.partId) ? params.partId : "1";
    router.replace(`/speaking/partner?mode=exam&part=${part}`);
  }, [router, params.partId]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <LoadingSpinner />
      <p className="text-sm text-content-secondary">Adam bilan mashq ochilmoqda...</p>
    </div>
  );
}
