import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { extendedExpiry, planDaysFromAmount } from "@/lib/pro";

export async function POST(req: NextRequest) {
  try {
    const { payment_id } = await req.json();

    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get payment
    const { data: payment } = await supabase
      .from("payments")
      .select("id, user_id, status, amount")
      .eq("id", payment_id)
      .single();

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "pending") {
      return NextResponse.json({ error: "Payment already processed" }, { status: 400 });
    }

    // Grant Pro first — if this fails we bail out and leave the payment
    // "pending" so the admin can safely retry the approval instead of getting
    // stuck with an "approved" payment but no Pro granted.
    // The length comes from the amount actually paid (1/3/12 months), and an
    // early renewal adds to the time the user still has left.
    const proDays = planDaysFromAmount(payment.amount);
    const { data: current } = await supabase
      .from("profiles")
      .select("pro_expires_at")
      .eq("id", payment.user_id)
      .single();
    const proExpiresAt = extendedExpiry(current?.pro_expires_at, proDays);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        is_pro: true,
        pro_expires_at: proExpiresAt,
      })
      .eq("id", payment.user_id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Approve payment. Pro is already granted at this point, so even if
    // this update fails we still report success but log the inconsistency
    // for manual reconciliation.
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "approved", verified_at: new Date().toISOString() })
      .eq("id", payment_id);

    if (updateError) {
      console.error("Mark payment approved error:", updateError, "payment_id:", payment_id);
    }

    return NextResponse.json({
      success: true,
      days: proDays,
      pro_expires_at: proExpiresAt,
      message: "Payment approved and Pro activated",
    });
  } catch (error: any) {
    console.error("Approve payment error:", error);
    return NextResponse.json({ error: "Failed to approve payment" }, { status: 500 });
  }
}
