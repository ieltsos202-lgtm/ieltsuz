import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json({ total: 0, mastered: 0, due: 0 });
    }

    const { data } = await supabase
      .from("vocabulary")
      .select("mastered, next_review")
      .eq("user_id", user.id);

    const rows = data || [];
    const now = Date.now();
    const stats = {
      total: rows.length,
      mastered: rows.filter((r) => r.mastered).length,
      due: rows.filter(
        (r) => !r.mastered && (!r.next_review || new Date(r.next_review).getTime() <= now)
      ).length,
    };

    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ total: 0, mastered: 0, due: 0 });
  }
}
