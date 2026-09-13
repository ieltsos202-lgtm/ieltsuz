"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Headphones,
  BookOpen,
  PenLine,
  Mic,
  ClipboardList,
  Library,
  TrendingUp,
  Shield,
  Crown,
  GraduationCap,
  ExternalLink,
  BarChart3,
  Gamepad2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "AI Teacher", href: "/coach", icon: GraduationCap },
  { label: "Listening", href: "/listening", icon: Headphones },
  { label: "Reading", href: "/reading", icon: BookOpen },
  { label: "Writing", href: "/writing", icon: PenLine },
  { label: "Speaking", href: "/speaking", icon: Mic },
  { label: "Mock Test", href: "/mock-test", icon: ClipboardList },
  { label: "Games", href: "/game", icon: Gamepad2 },
  { label: "Vocabulary", href: "/vocabulary", icon: Library },
  { label: "Progress", href: "/progress", icon: TrendingUp },
];

interface SidebarProps {
  open?: boolean;
}

export function Sidebar({ open = true }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();

  const items = profile?.is_admin
    ? [...nav, { label: "Analytics", href: "/analytics", icon: BarChart3 }, { label: "Admin", href: "/admin", icon: Shield }]
    : nav;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col overflow-hidden border-r border-border bg-bg-secondary p-4 transition-transform duration-300 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <Link href="/dashboard" className="shrink-0 px-3 py-2 text-xl font-extrabold gradient-text">
        IELTSUZ
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto min-h-0 py-6">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/15 text-content-primary"
                  : "text-content-secondary hover:bg-bg-tertiary hover:text-content-primary"
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "text-accent")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 space-y-2 border-t border-border pt-4">
        <Link
          href="/upgrade"
          className="flex items-center gap-2 rounded-[var(--radius)] bg-gradient-to-r from-accent/20 to-accent-purple/20 px-3 py-2.5 text-sm font-semibold text-content-primary transition-colors hover:from-accent/30 hover:to-accent-purple/30"
        >
          <Crown className="h-5 w-5 text-accent-yellow" />
          Upgrade
        </Link>
        <a
          href="https://t.me/ieltsosuzb"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-tertiary hover:text-accent"
        >
          <ExternalLink className="h-4 w-4" />
          Join our channel
        </a>
      </div>
    </aside>
  );
}
