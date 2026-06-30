import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ vocabulary: [] });

    const { data } = await supabase
      .from("vocabulary")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ vocabulary: data || [] });
  } catch {
    return NextResponse.json({ vocabulary: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { data } = await supabase.from("vocabulary").insert({
      user_id: user.id,
      word: body.word,
      definition: body.definition,
      translation: body.translation ?? null,
      example: body.example ?? null,
      source: body.source ?? body.context ?? null,
    }).select();

    return NextResponse.json(data?.[0] || {});
  } catch {
    return NextResponse.json({ error: "Failed to add word" }, { status: 500 });
  }
}
