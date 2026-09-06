import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

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
      .select("id, user_id, status")
      .eq("id", payment_id)
      .single();

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "pending") {
      return NextResponse.json({ error: "Payment already processed" }, { status: 400 });
    }

    // Grant 30-day Pro access first — if this fails we bail out and leave
    // the payment "pending" so the admin can safely retry the approval
    // instead of getting stuck with an "approved" payment but no Pro granted.
    const proExpiresAt = new Date();
    proExpiresAt.setDate(proExpiresAt.getDate() + 30);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        is_pro: true,
        pro_expires_at: proExpiresAt.toISOString(),
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

    return NextResponse.json({ success: true, message: "Payment approved and Pro activated" });
  } catch (error: any) {
    console.error("Approve payment error:", error);
    return NextResponse.json({ error: "Failed to approve payment" }, { status: 500 });
  }
}
