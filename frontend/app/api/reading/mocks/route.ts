import { NextResponse } from "next/server";
import { READING_MOCKS } from "@/lib/mocks";

export async function GET() {
  return NextResponse.json({ mocks: READING_MOCKS });
}
