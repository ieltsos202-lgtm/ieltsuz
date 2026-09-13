import { NextResponse } from "next/server";
import { LISTENING_MOCKS } from "@/lib/mocks";

export async function GET() {
  return NextResponse.json({ mocks: LISTENING_MOCKS });
}
