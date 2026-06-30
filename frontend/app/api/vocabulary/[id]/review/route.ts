import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const { data: existing } = await supabase
      .from("vocabulary")
      .select("review_count")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const reviewCount = (existing?.review_count ?? 0) + 1;
    // Spaced repetition: known answers push the next review further out.
    const daysAhead = body.known ? Math.min(2 ** reviewCount, 60) : 1;
    const nextReview = new Date(Date.now() + daysAhead * 86400000).toISOString();

    await supabase
      .from("vocabulary")
      .update({
        review_count: reviewCount,
        mastered: Boolean(body.known) && reviewCount >= 3,
        next_review: nextReview,
      })
      .eq("id", params.id)
      .eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
