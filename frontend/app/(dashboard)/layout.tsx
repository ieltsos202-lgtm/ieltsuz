"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { isProActive } from "@/lib/pro";

/** Routes accessible after free trials are exhausted (non-Pro users). */
const TRIAL_EXEMPT_PREFIXES = ["/upgrade", "/settings", "/progress", "/coach"];

/** Full-screen test runners: sidebar and header are hidden. */
const IMMERSIVE_ROUTE = /^\/(listening|reading)\/[^/]+$/;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    if (!loading && user && profile && !profile.onboarding_completed && !profile.current_level) {
      router.replace("/onboarding");
      return;
    }
    // An expired Pro subscription must fall back to trial rules, so the
    // check is the shared expiry-aware one, not the raw is_pro flag.
    if (!loading && user && profile && !isProActive(profile)) {
      const mockRemaining =
        (profile.trial_mock_remaining ?? 0) + (profile.bonus_mock_remaining ?? 0);
      const allTrialsUsed =
        (profile.trial_listening_remaining ?? 0) === 0 &&
        (profile.trial_reading_remaining ?? 0) === 0 &&
        (profile.trial_speaking_remaining ?? 0) === 0 &&
        (profile.trial_writing_remaining ?? 0) === 0 &&
        mockRemaining === 0;

      const isExempt = TRIAL_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

      if (allTrialsUsed && !isExempt) {
        router.replace("/upgrade");
      }
    }
  }, [loading, user, profile, router, pathname]);

  if (loading || !user || profile === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (IMMERSIVE_ROUTE.test(pathname)) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`transition-all duration-300 ${sidebarOpen ? "lg:pl-64" : ""}`}>
        <Header onMenuToggle={() => setSidebarOpen((v) => !v)} menuOpen={sidebarOpen} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
