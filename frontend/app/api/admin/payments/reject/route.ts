import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const { payment_id, reason } = await req.json();

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

    const { error } = await supabase
      .from("payments")
      .update({
        status: "rejected",
        verified_at: new Date().toISOString(),
        rejection_reason: reason || "Payment could not be verified",
      })
      .eq("id", payment_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Payment rejected" });
  } catch (error: any) {
    console.error("Reject payment error:", error);
    return NextResponse.json({ error: "Failed to reject payment" }, { status: 500 });
  }
}
