"use client";

import { useParams } from "next/navigation";
import { MockTestRunner } from "@/components/mocks/MockTestRunner";

export default function ListeningTestPage() {
  const params = useParams<{ testId: string }>();
  return <MockTestRunner kind="listening" testId={params.testId || "L1"} />;
}