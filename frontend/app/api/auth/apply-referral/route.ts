import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { promo_code } = await req.json();
    if (!promo_code || typeof promo_code !== "string") {
      return NextResponse.json({ error: "Promo code required" }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .rpc("apply_referral", {
        new_user_id: user.id,
        promo: promo_code.trim(),
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Failed to apply referral" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, bonus_mock_granted: data.bonus_mock_granted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
