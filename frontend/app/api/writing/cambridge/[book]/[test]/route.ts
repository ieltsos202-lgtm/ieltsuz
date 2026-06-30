import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { book: string; test: string } }
) {
  return NextResponse.json({
    found: false,
    book: params.book,
    test: params.test,
    task1: "Describe a chart showing trends in urban population (20 minutes, 150 words).",
    task2: "Discuss whether technology has made our lives better or worse (40 minutes, 250 words).",
  });
}
