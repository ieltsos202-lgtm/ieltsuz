"use client";

import { useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  CreditCard,
  Activity,
  Zap,
  BarChart3,
  RefreshCw,
  TrendingUp,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";

interface AnalyticsData {
  totalUsers: number;
  newUsersToday: number;
  paidUsers: number;
  dailyActiveUsers: number;
  currentlyActiveUsers: number;
  totalRevenue: number;
  totalVerifiedPayments: number;
  testsCompletedToday: number;
  weeklyTrend: { date: string; active: number }[];
  updatedAt: string;
}

const REFRESH_INTERVAL = 15000; // 15 seconds

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchStats() {
    try {
      const json = await apiGet<AnalyticsData>("/api/analytics/stats");
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      const msg = err?.message || "Statistikani yuklab bo‘lmadi";
      if (msg.includes("403")) {
        setError("Sizda ruxsat yo‘q. Admin huquqi kerak. Supabase'da: UPDATE profiles SET is_admin = true WHERE email = 'sizning@email.com';");
      } else if (msg.includes("401")) {
        setError("Iltimos, avval tizimga kiring.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const statCards = data
    ? [
        {
          label: "Jami foydalanuvchilar",
          value: data.totalUsers,
          icon: Users,
          color: "text-accent",
          bg: "bg-accent/10",
        },
        {
          label: "Bugun qo‘shilgan",
          value: data.newUsersToday,
          icon: UserPlus,
          color: "text-accent-green",
          bg: "bg-accent-green/10",
        },
        {
          label: "Hozir online",
          value: data.currentlyActiveUsers,
          icon: Zap,
          color: "text-accent-yellow",
          bg: "bg-accent-yellow/10",
        },
        {
          label: "24 soat ichida faol",
          value: data.dailyActiveUsers,
          icon: Activity,
          color: "text-accent-purple",
          bg: "bg-accent-purple/10",
        },
        {
          label: "Pro / To‘lov qilgan",
          value: data.paidUsers,
          icon: CreditCard,
          color: "text-accent-purple",
          bg: "bg-accent-purple/10",
        },
        {
          label: "Bugun test topshirilgan",
          value: data.testsCompletedToday,
          icon: BarChart3,
          color: "text-accent",
          bg: "bg-accent/10",
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">IELTSUZ Analytics</h1>
            <p className="text-sm text-content-secondary">
              Real-time platform statistics
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="flex items-center gap-1 text-xs text-content-secondary">
                <Clock className="h-3 w-3" />
                Yangilandi: {lastUpdated.toLocaleTimeString("uz-UZ")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Yangilash
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {error && (
          <Card className="border-accent-red/30 bg-accent-red/5 p-4 text-accent-red">
            <p className="text-sm font-medium">Xatolik: {error}</p>
          </Card>
        )}

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map((s) => (
            <Card
              key={s.label}
              className="flex flex-col items-center gap-3 p-5 text-center"
            >
              <div className={`rounded-full p-3 ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value.toLocaleString()}</p>
                <p className="text-xs text-content-secondary">{s.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Revenue card */}
        {data && (
          <Card className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-accent-green/10 p-3">
                <TrendingUp className="h-5 w-5 text-accent-green" />
              </div>
              <div>
                <p className="text-sm text-content-secondary">
                  Umumiy daromad (tasdiqlangan to‘lovlar)
                </p>
                <p className="text-2xl font-bold">
                  {(data.totalRevenue / 1000).toFixed(0)} ming so‘m
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-content-secondary">
                Tasdiqlangan to‘lovlar soni
              </p>
              <p className="text-xl font-bold">
                {data.totalVerifiedPayments.toLocaleString()}
              </p>
            </div>
          </Card>
        )}

        {/* Weekly trend chart */}
        {data && data.weeklyTrend.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">
              Oxirgi 7 kun — Kunlik faol foydalanuvchilar
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                    stroke="var(--content-secondary)"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="var(--content-secondary)"
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                    }}
                    formatter={(value: number) => [value, "Faol foydalanuvchilar"]}
                    labelFormatter={(label) => {
                      const d = new Date(label);
                      return d.toLocaleDateString("uz-UZ");
                    }}
                  />
                  <Bar dataKey="active" radius={[6, 6, 0, 0]}>
                    {data.weeklyTrend.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          index === data!.weeklyTrend.length - 1
                            ? "var(--accent)"
                            : "var(--accent)"
                        }
                        opacity={index === data!.weeklyTrend.length - 1 ? 1 : 0.6}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Activity pulse */}
        {data && data.currentlyActiveUsers > 0 && (
          <div className="flex items-center gap-2 text-sm text-accent-green">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-accent-green" />
            </span>
            Hozir {data.currentlyActiveUsers} ta foydalanuvchi platformada faol
          </div>
        )}
      </main>
    </div>
  );
}
