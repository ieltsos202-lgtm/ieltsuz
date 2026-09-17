"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

interface StatsData {
  overview: {
    totalUsers: number;
    newUsersToday: number;
    paidUsers: number;
    dailyActiveUsers: number;
    currentlyActiveUsers: number;
    totalRevenue: number;
    totalVerifiedPayments: number;
    testsCompletedToday: number;
    weeklyTrend: { date: string; active: number }[];
  };
  mastery: {
    totalVocabWords: number;
    totalMastered: number;
    masteryRate: number;
    avgOverallBand: number | null;
    studentsWithBandData: number;
  };
  users: UserRow[];
  updatedAt: string;
}

const REFRESH_INTERVAL = 20000;

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 26, fontWeight: 800, color }}>{value}</p>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchStats() {
    try {
      const res = await fetch("/api/stats");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Yuklashda xatolik");
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || "Yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const overview = data?.overview;
  const mastery = data?.mastery;

  const statCards = overview
    ? [
        { label: "Jami foydalanuvchilar", value: overview.totalUsers, color: "var(--accent)" },
        { label: "Bugun qo‘shilgan", value: overview.newUsersToday, color: "var(--accent-green)" },
        { label: "Hozir online", value: overview.currentlyActiveUsers, color: "var(--accent-yellow)" },
        { label: "24 soat faol", value: overview.dailyActiveUsers, color: "var(--accent-purple)" },
        { label: "Pro sotib olgan", value: overview.paidUsers, color: "var(--accent-purple)" },
        { label: "Bugun testlar", value: overview.testsCompletedToday, color: "var(--accent)" },
      ]
    : [];

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>IELTSUZ Admin Panel</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Ro‘yxatdan o‘tganlar, to‘lovlar, daromad va o‘zlashtirish — real vaqtda
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Yangilandi: {lastUpdated.toLocaleTimeString("uz-UZ")}
            </span>
          )}
          <button
            onClick={fetchStats}
            disabled={loading}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Yangilash
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--accent-red)",
              background: "transparent",
              color: "var(--accent-red)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Chiqish
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {error && (
          <div
            style={{
              border: "1px solid var(--accent-red)",
              background: "rgba(239,68,68,0.08)",
              borderRadius: 10,
              padding: 14,
              color: "var(--accent-red)",
              fontSize: 13,
            }}
          >
            Xatolik: {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {statCards.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {overview && (
            <div
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 20,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Umumiy daromad</p>
                <p style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 0" }}>
                  {(overview.totalRevenue / 1000).toFixed(0)} ming so‘m
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Tasdiqlangan to‘lovlar</p>
                <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0" }}>{overview.totalVerifiedPayments}</p>
              </div>
            </div>
          )}

          {mastery && (
            <div
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 20,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>O‘zlashtirish darajasi</p>
                <p style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 0" }}>{mastery.masteryRate}%</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  {mastery.totalMastered} / {mastery.totalVocabWords} so‘z
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>O‘rtacha band</p>
                <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0" }}>{mastery.avgOverallBand ?? "—"}</p>
              </div>
            </div>
          )}
        </div>

        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              Barcha foydalanuvchilar ({filteredUsers.length})
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism yoki email bo‘yicha qidirish..."
              style={{
                width: 260,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 900, fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: "8px 10px" }}>Foydalanuvchi</th>
                  <th style={{ padding: "8px 10px" }}>Ro‘yxatdan o‘tgan</th>
                  <th style={{ padding: "8px 10px" }}>Pro</th>
                  <th style={{ padding: "8px 10px" }}>Bandlar (L/R/W/S)</th>
                  <th style={{ padding: "8px 10px" }}>Umumiy band</th>
                  <th style={{ padding: "8px 10px" }}>Lug‘at</th>
                  <th style={{ padding: "8px 10px" }}>XP</th>
                  <th style={{ padding: "8px 10px" }}>Testlar</th>
                  <th style={{ padding: "8px 10px" }}>To‘lagan (so‘m)</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                      Yuklanmoqda...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                      Foydalanuvchi topilmadi.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600 }}>{u.full_name || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{u.email}</div>
                      </td>
                      <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>
                        {new Date(u.created_at).toLocaleDateString("uz-UZ")}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {u.is_pro ? (
                          <span style={{ background: "rgba(168,85,247,0.12)", color: "var(--accent-purple)", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            PRO
                          </span>
                        ) : (
                          <span style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", padding: "2px 8px", borderRadius: 999, fontSize: 11 }}>
                            Free
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>
                        {u.listening_band ?? "-"} / {u.reading_band ?? "-"} / {u.writing_band ?? "-"} / {u.speaking_band ?? "-"}
                      </td>
                      <td style={{ padding: "8px 10px", fontWeight: 700 }}>{u.overall_band ?? "—"}</td>
                      <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>
                        {u.vocab_mastered} / {u.vocab_total}
                      </td>
                      <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{u.xp}</td>
                      <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{u.tests_completed}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{u.total_paid.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {overview && overview.currentlyActiveUsers > 0 && (
          <div style={{ color: "var(--accent-green)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--accent-green)",
                display: "inline-block",
              }}
            />
            Hozir {overview.currentlyActiveUsers} ta foydalanuvchi platformada faol
          </div>
        )}
      </main>
    </div>
  );
}
