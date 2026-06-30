import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

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
    const MONTHLY_PRICE = parseInt(process.env.MONTHLY_PRICE_UZS || "49000", 10);

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        payment_code: code,
        amount: MONTHLY_PRICE,
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
