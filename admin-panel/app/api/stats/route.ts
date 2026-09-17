import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const RESULT_TABLES = [
  "speaking_results",
  "listening_results",
  "reading_results",
  "writing_results",
  "mock_test_results",
];
const ACTIVITY_TABLES = [...RESULT_TABLES, "coach_messages"];

// Consolidated stats for the standalone admin panel: platform-wide
// overview counters, a full per-user table (bands, vocab mastery, XP,
// revenue), and aggregate "how well are students learning" mastery stats.
// Reads directly from the main IELTSUZ site's Supabase project via the
// service-role key (this app is otherwise fully independent — separate
// codebase, deployment, and its own password gate via middleware.ts).
export async function GET() {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [
      { data: profiles, error: profilesErr },
      { data: vocabRows, error: vocabErr },
      { data: paymentRows, error: paymentErr },
      { data: statsRows, error: statsErr },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, full_name, email, created_at, is_pro, pro_expires_at, target_band, current_level, listening_band, reading_band, writing_band, speaking_band"
        )
        .order("created_at", { ascending: false }),
      admin.from("vocabulary").select("user_id, mastered"),
      admin.from("payments").select("user_id, amount, status"),
      admin.from("user_game_stats").select("user_id, xp, games_played, best_combo"),
    ]);
    if (profilesErr) throw profilesErr;
    if (vocabErr) throw vocabErr;
    if (paymentErr) throw paymentErr;
    if (statsErr) throw statsErr;

    const activityByUser = new Map<string, number>();
    const dailyActiveSet = new Set<string>();
    const currentlyActiveSet = new Set<string>();
    let testsCompletedToday = 0;

    for (const table of RESULT_TABLES) {
      const { data } = await admin.from(table).select("user_id, created_at");
      (data || []).forEach((row: any) => {
        if (!row.user_id) return;
        activityByUser.set(row.user_id, (activityByUser.get(row.user_id) || 0) + 1);
        if (row.created_at >= todayStart.toISOString()) testsCompletedToday += 1;
      });
    }
    for (const table of ACTIVITY_TABLES) {
      const { data } = await admin.from(table).select("user_id, created_at").gte("created_at", dayAgo);
      (data || []).forEach((row: any) => {
        if (!row.user_id) return;
        dailyActiveSet.add(row.user_id);
        if (row.created_at >= tenMinAgo) currentlyActiveSet.add(row.user_id);
      });
    }

    const vocabByUser = new Map<string, { total: number; mastered: number }>();
    let totalVocabWords = 0;
    let totalMastered = 0;
    (vocabRows || []).forEach((row: any) => {
      totalVocabWords += 1;
      if (row.mastered) totalMastered += 1;
      const cur = vocabByUser.get(row.user_id) || { total: 0, mastered: 0 };
      cur.total += 1;
      if (row.mastered) cur.mastered += 1;
      vocabByUser.set(row.user_id, cur);
    });

    const revenueByUser = new Map<string, number>();
    let totalRevenue = 0;
    let totalVerifiedPayments = 0;
    (paymentRows || []).forEach((row: any) => {
      if (row.status !== "approved" && row.status !== "verified") return;
      totalRevenue += row.amount || 0;
      totalVerifiedPayments += 1;
      revenueByUser.set(row.user_id, (revenueByUser.get(row.user_id) || 0) + (row.amount || 0));
    });

    const gameStatsByUser = new Map<string, { xp: number; games_played: number }>();
    (statsRows || []).forEach((row: any) => {
      gameStatsByUser.set(row.user_id, { xp: row.xp || 0, games_played: row.games_played || 0 });
    });

    interface UserRow {
      id: string;
      full_name: string;
      email: string;
      created_at: string;
      is_pro: boolean;
      pro_expires_at: string | null;
      target_band: number | null;
      listening_band: number | null;
      reading_band: number | null;
      writing_band: number | null;
      speaking_band: number | null;
      overall_band: number | null;
      vocab_total: number;
      vocab_mastered: number;
      xp: number;
      tests_completed: number;
      total_paid: number;
    }

    const now = new Date();
    const users: UserRow[] = (profiles || []).map((p: any) => {
      const vocab = vocabByUser.get(p.id) || { total: 0, mastered: 0 };
      const game = gameStatsByUser.get(p.id) || { xp: 0, games_played: 0 };
      const bands = [p.listening_band, p.reading_band, p.writing_band, p.speaking_band].filter(
        (b: number | null) => typeof b === "number"
      ) as number[];
      const overallBand = bands.length > 0 ? Math.round((bands.reduce((s, b) => s + b, 0) / bands.length) * 2) / 2 : null;
      const isProActive = p.is_pro && (!p.pro_expires_at || new Date(p.pro_expires_at) >= now);
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        created_at: p.created_at,
        is_pro: !!isProActive,
        pro_expires_at: p.pro_expires_at,
        target_band: p.target_band,
        listening_band: p.listening_band,
        reading_band: p.reading_band,
        writing_band: p.writing_band,
        speaking_band: p.speaking_band,
        overall_band: overallBand,
        vocab_total: vocab.total,
        vocab_mastered: vocab.mastered,
        xp: game.xp,
        tests_completed: activityByUser.get(p.id) || 0,
        total_paid: revenueByUser.get(p.id) || 0,
      };
    });

    const totalUsers = users.length;
    const newUsersToday = users.filter((u) => u.created_at >= todayStart.toISOString()).length;
    const paidUsers = users.filter((u) => u.is_pro).length;

    const weeklyTrend: { date: string; active: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      const daySet = new Set<string>();
      for (const table of ACTIVITY_TABLES) {
        const { data } = await admin
          .from(table)
          .select("user_id")
          .gte("created_at", d.toISOString())
          .lt("created_at", nextDay.toISOString());
        (data || []).forEach((row: any) => {
          if (row.user_id) daySet.add(row.user_id);
        });
      }
      weeklyTrend.push({ date: d.toISOString().split("T")[0], active: daySet.size });
    }

    const usersWithBand = users.filter((u) => u.overall_band !== null);
    const avgOverallBand =
      usersWithBand.length > 0
        ? Math.round((usersWithBand.reduce((s, u) => s + (u.overall_band as number), 0) / usersWithBand.length) * 2) / 2
        : null;
    const masteryRate = totalVocabWords > 0 ? Math.round((totalMastered / totalVocabWords) * 100) : 0;

    return NextResponse.json({
      overview: {
        totalUsers,
        newUsersToday,
        paidUsers,
        dailyActiveUsers: dailyActiveSet.size,
        currentlyActiveUsers: currentlyActiveSet.size,
        totalRevenue,
        totalVerifiedPayments,
        testsCompletedToday,
        weeklyTrend,
      },
      mastery: {
        totalVocabWords,
        totalMastered,
        masteryRate,
        avgOverallBand,
        studentsWithBandData: usersWithBand.length,
      },
      users,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Admin panel stats error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load stats" }, { status: 500 });
  }
}
