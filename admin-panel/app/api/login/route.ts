import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_PANEL_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PANEL_PASSWORD not configured on the server." },
      { status: 503 }
    );
  }
  if (password !== expected) {
    return NextResponse.json({ error: "Noto‘g‘ri parol." }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
