import { NextRequest, NextResponse } from "next/server";
import { getAuthedClient, getAdminClient } from "@/lib/supabaseServer";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    // Unauthenticated by design (QR flow) — so cap lookups per IP to keep the
    // code space from being enumerated.
    if (rateLimit(`pay-status:${clientIp(req)}`, 60, 10 * 60_000)) {
      return NextResponse.json({ error: "Juda ko'p so'rov." }, { status: 429 });
    }
    // Code-based lookup: works without a session (e.g. phone scanning a QR
    // from a logged-in desktop). Falls back to the token client if no
    // service-role key is configured.
    const supabase = getAdminClient() ?? getAuthedClient(req).supabase;
    const code = params.code;

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .select("id, payment_code, amount, status, payment_method, created_at, verified_at, rejection_reason")
      .eq("payment_code", code)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ payment });
  } catch (error: any) {
    console.error("Payment status error:", error);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
