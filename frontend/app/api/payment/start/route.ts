import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { PLANS } from "@/lib/pro";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return `IELTS-${code}`;
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const code = generateCode();

    // Prices live in lib/pro so the amount written here is the same amount the
    // verification step maps back to a subscription length.
    const body = await req.json().catch(() => ({} as any));
    const selected = PLANS.find((p) => p.id === body?.plan) ?? PLANS[0];
    const amount = selected.amount;

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        payment_code: code,
        amount,
        payment_method: "payme",
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", JSON.stringify(error));
      return NextResponse.json({ error: `DB Error: ${error.message} (${error.code})` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      code,
      payment,
    });
  } catch (error: any) {
    console.error("Payment start error:", error);
    return NextResponse.json({ error: "Failed to start payment" }, { status: 500 });
  }
}
