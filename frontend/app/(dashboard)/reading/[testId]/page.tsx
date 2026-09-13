"use client";

import { useParams } from "next/navigation";
import { MockTestRunner } from "@/components/mocks/MockTestRunner";

export default function ReadingTestPage() {
  const params = useParams<{ testId: string }>();
  return <MockTestRunner kind="reading" testId={params.testId || "R1"} />;
}