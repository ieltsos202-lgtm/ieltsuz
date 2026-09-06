"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield, DollarSign, Check, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";

interface AdminPayment {
  id: string;
  user_id: string;
  payment_code: string;
  amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

function PaymentsTab() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setActionError("");
    try {
      const res = await apiGet<{ payments: AdminPayment[] }>(`/api/admin/payments?status=${statusFilter}`);
      setPayments(res.payments || []);
    } catch (e: any) {
      console.error(e);
      setActionError(e?.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setActionLoading(id);
    setActionError("");
    try {
      await apiPost("/api/admin/payments/approve", { payment_id: id });
      load();
    } catch (e: any) {
      console.error(e);
      setActionError(e?.message || "Failed to approve payment");
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (id: string) => {
    setActionLoading(id);
    setActionError("");
    try {
      await apiPost("/api/admin/payments/reject", { payment_id: id, reason: "Could not verify payment" });
      load();
    } catch (e: any) {
      console.error(e);
      setActionError(e?.message || "Failed to reject payment");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium transition-colors",
              statusFilter === s ? "bg-accent text-white" : "bg-bg-tertiary text-content-secondary hover:text-content-primary"
            )}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : payments.length === 0 ? (
        <p className="py-8 text-center text-sm text-content-secondary">No {statusFilter} payments.</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-accent/10 px-2 py-0.5 text-sm font-bold text-accent">
                      {p.payment_code}
                    </code>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        p.status === "pending"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : p.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-red-500/10 text-red-600 dark:text-red-400"
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-sm text-content-secondary">
                    {p.profiles?.full_name || "Unknown"} · {p.profiles?.email || "No email"}
                  </p>
                  <p className="text-xs text-content-secondary">
                    {p.amount?.toLocaleString()} UZS · {p.payment_method?.toUpperCase()} ·{" "}
                    {new Date(p.created_at).toLocaleString("uz-UZ")}
                  </p>
                </div>

                {p.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                      onClick={() => approve(p.id)}
                      disabled={actionLoading === p.id}
                    >
                      {actionLoading === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50 dark:text-red-400"
                      onClick={() => reject(p.id)}
                      disabled={actionLoading === p.id}
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && profile && !profile.is_admin) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  if (loading) return <LoadingSpinner />;
  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-md text-center">
        <Shield className="mx-auto h-10 w-10 text-content-secondary" />
        <p className="mt-3 text-content-secondary">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-sm text-content-secondary">Review and verify Pro upgrade payments.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold">Payments</h2>
      </div>

      <PaymentsTab />
    </div>
  );
}
