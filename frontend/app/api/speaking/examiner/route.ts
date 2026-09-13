import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await (supabase as any)
    .from("speaking_examiners")
    .select("examiner_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ examiner_name: data?.examiner_name ?? null });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const examinerName = (body?.examiner_name || "").trim();
  if (!examinerName) {
    return NextResponse.json({ error: "examiner_name is required" }, { status: 400 });
  }
  if (examinerName.length > 40) {
    return NextResponse.json({ error: "examiner_name is too long" }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from("speaking_examiners")
    .upsert({ user_id: user.id, examiner_name: examinerName }, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ examiner_name: examinerName });
}
