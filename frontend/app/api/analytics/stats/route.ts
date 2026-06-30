import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuth } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Require an authenticated admin — analytics expose revenue & user data.
  const { supabase, user } = await getAuth(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    return NextResponse.json(
      { error: "Forbidden — admin access required." },
      { status: 403 }
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Analytics disabled. SUPABASE_SERVICE_ROLE_KEY not configured." },
      { status: 503 }
    );
  }

  try {
    // 1. Total registered users
    const { count: totalUsers, error: totalErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (totalErr) throw totalErr;

    // 2. New users today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: newUsersToday, error: newErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());
    if (newErr) throw newErr;

    // 3. Paid users (is_pro = true, not expired)
    const { count: paidUsers, error: paidErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_pro", true)
      .or("pro_expires_at.is.null,pro_expires_at.gte." + new Date().toISOString());
    if (paidErr) throw paidErr;

    // 4. Total verified payments + revenue
    const { data: paymentsData, error: paymentsErr } = await admin
      .from("payments")
      .select("amount")
      .eq("status", "verified");
    if (paymentsErr) throw paymentsErr;
    const totalRevenue = (paymentsData || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalVerifiedPayments = (paymentsData || []).length;

    // 5. Daily active users (any activity in last 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const activityTables = [
      "speaking_results",
      "listening_results",
      "reading_results",
      "writing_results",
      "mock_test_results",
      "coach_messages",
    ];
    const dailyActiveSet = new Set<string>();
    for (const table of activityTables) {
      const { data } = await admin.from(table).select("user_id").gte("created_at", dayAgo);
      (data || []).forEach((row: any) => {
        if (row.user_id) dailyActiveSet.add(row.user_id);
      });
    }
    const dailyActiveUsers = dailyActiveSet.size;

    // 6. Currently active users (any activity in last 10 minutes)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const currentlyActiveSet = new Set<string>();
    for (const table of activityTables) {
      const { data } = await admin.from(table).select("user_id").gte("created_at", tenMinAgo);
      (data || []).forEach((row: any) => {
        if (row.user_id) currentlyActiveSet.add(row.user_id);
      });
    }
    const currentlyActiveUsers = currentlyActiveSet.size;

    // 7. Tests completed today (all result types)
    let testsCompletedToday = 0;
    for (const table of activityTables) {
      const { count } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString());
      testsCompletedToday += count || 0;
    }

    // 8. Weekly trend — daily active users for last 7 days
    const weeklyTrend: { date: string; active: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      const daySet = new Set<string>();
      for (const table of activityTables) {
        const { data } = await admin
          .from(table)
          .select("user_id")
          .gte("created_at", d.toISOString())
          .lt("created_at", nextDay.toISOString());
        (data || []).forEach((row: any) => {
          if (row.user_id) daySet.add(row.user_id);
        });
      }
      weeklyTrend.push({
        date: d.toISOString().split("T")[0],
        active: daySet.size,
      });
    }

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      newUsersToday: newUsersToday || 0,
      paidUsers: paidUsers || 0,
      dailyActiveUsers,
      currentlyActiveUsers,
      totalRevenue,
      totalVerifiedPayments,
      testsCompletedToday,
      weeklyTrend,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Analytics error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load analytics" },
      { status: 500 }
    );
  }
}
