import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { limitsFor, loadIsPro, loadRpgProfile, loadUsage, localDay } from "@/lib/rpg/db";
import { clampLevel } from "@/lib/rpg/levels";
import { sanitizeFact } from "@/lib/rpg/safety";
import type { RpgProfileView } from "@/lib/rpg/types";

export const dynamic = "force-dynamic";

/** Level, XP, streak and what is left of today's allowance. */
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const day = localDay(new URL(req.url).searchParams.get("day"));
    const [profile, isPro, usage, { count }] = await Promise.all([
      loadRpgProfile(supabase, user.id),
      loadIsPro(supabase, user.id),
      loadUsage(supabase, user.id, day),
      supabase
        .from("rpg_words")
        .select("word", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    const limits = limitsFor(isPro);
    const view: RpgProfileView = {
      hero_name: profile.hero_name,
      // A player whose level sits above what their plan allows is pulled back
      // down, so an expired Pro cannot keep level 5 content.
      level: clampLevel(profile.level, limits.maxLevel),
      xp: profile.xp,
      streak: profile.streak,
      is_pro: isPro,
      words_learned: count ?? 0,
      badges: profile.badges,
      limits: {
        scenes_left: Math.max(0, limits.scenesPerDay - usage.scenes_started),
        turns_left: Math.max(0, limits.aiTurnsPerDay - usage.ai_turns),
        max_level: limits.maxLevel,
      },
    };

    return NextResponse.json(view);
  } catch (error) {
    console.error("rpg/profile GET error:", error);
    return NextResponse.json({ error: "Profilni yuklab bo'lmadi." }, { status: 500 });
  }
}

/** Manual settings: hero name and a chosen difficulty level. */
export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const isPro = await loadIsPro(supabase, user.id);
    const limits = limitsFor(isPro);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.hero_name !== undefined) {
      // Reuse the fact sanitiser: it already strips markup and rejects
      // anything that looks like personal data.
      const name = sanitizeFact(body.hero_name, 30);
      if (!name) {
        return NextResponse.json({ error: "Ismni to'g'ri kiriting." }, { status: 400 });
      }
      patch.hero_name = name;
    }

    if (body.level !== undefined) {
      const requested = clampLevel(body.level, limits.maxLevel);
      if (Number(body.level) > limits.maxLevel) {
        return NextResponse.json(
          {
            error: `${limits.maxLevel}-darajadan yuqorisi hozircha ochiq emas.`,
            upgrade: !isPro,
          },
          { status: 402 }
        );
      }
      patch.level = requested;
    }

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: "O'zgartirish uchun ma'lumot yo'q." }, { status: 400 });
    }

    // Make sure the row exists before patching it.
    await loadRpgProfile(supabase, user.id);
    const { error } = await supabase.from("rpg_profile").update(patch).eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("rpg/profile PATCH error:", error);
    return NextResponse.json({ error: "Saqlab bo'lmadi." }, { status: 500 });
  }
}
