"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Headphones,
  BookOpen,
  PenLine,
  Mic,
  ClipboardList,
  ClipboardCheck,
  Library,
  TrendingUp,
  Crown,
  GraduationCap,
  ExternalLink,
  Gamepad2,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";
import { formatExpiry } from "@/lib/pro";

interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  children?: NavChild[];
}

const nav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "AI Teacher", href: "/coach", icon: GraduationCap },
  {
    label: "Tests",
    icon: ClipboardList,
    children: [
      { label: "Listening", href: "/listening", icon: Headphones },
      { label: "Reading", href: "/reading", icon: BookOpen },
      { label: "Writing", href: "/writing", icon: PenLine },
      { label: "Mock Test", href: "/mock-test", icon: ClipboardCheck },
    ],
  },
  { label: "Speaking", href: "/speaking", icon: Mic },
  { label: "Games", href: "/games", icon: Gamepad2 },
  { label: "Vocabulary", href: "/vocabulary", icon: Library },
  { label: "Progress", href: "/progress", icon: TrendingUp },
];

const linkClass = (isCurrent: boolean) =>
  cn(
    "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium transition-colors",
    isCurrent
      ? "bg-accent/15 text-content-primary"
      : "text-content-secondary hover:bg-bg-tertiary hover:text-content-primary"
  );

interface SidebarProps {
  open?: boolean;
}

export function Sidebar({ open = true }: SidebarProps) {
  const pathname = usePathname();
  const { active, expiresAt, daysLeft, plan } = useSubscription();

  // Groups auto-expand while one of their children is the current route;
  // the user's manual toggle wins until they navigate into the group again.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const currentGroup = nav.find(
    (item) =>
      item.children?.some(
        (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
      )
  )?.label;
  useEffect(() => {
    if (currentGroup) {
      setOpenGroups((s) => (s[currentGroup] ? s : { ...s, [currentGroup]: true }));
    }
  }, [currentGroup]);

  const items: NavItem[] = nav;

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
          if (item.children) {
            const isCurrent = item.children.some(
              (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
            );
            const isOpen = openGroups[item.label] ?? isCurrent;
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((s) => ({ ...s, [item.label]: !isOpen }))
                  }
                  aria-expanded={isOpen}
                  className={cn(linkClass(isCurrent), "w-full")}
                >
                  <item.icon className={cn("h-5 w-5", isCurrent && "text-accent")} />
                  {item.label}
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                    {item.children.map((child) => {
                      const childCurrent =
                        pathname === child.href ||
                        pathname.startsWith(`${child.href}/`);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-[13px] font-medium transition-colors",
                            childCurrent
                              ? "bg-accent/15 text-content-primary"
                              : "text-content-secondary hover:bg-bg-tertiary hover:text-content-primary"
                          )}
                        >
                          <child.icon
                            className={cn("h-4 w-4", childCurrent && "text-accent")}
                          />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isCurrent =
            !!item.href &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
            <Link key={item.href} href={item.href!} className={linkClass(isCurrent)}>
              <item.icon className={cn("h-5 w-5", isCurrent && "text-accent")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 space-y-2 border-t border-border pt-4">
        {active ? (
          // Pro users must never see an "Upgrade" call to action — they see
          // which plan is running and how much of it is left.
          <Link
            href="/settings/subscription"
            className="block rounded-[var(--radius)] bg-gradient-to-r from-accent/20 to-accent-purple/20 px-3 py-2.5 transition-colors hover:from-accent/30 hover:to-accent-purple/30"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-content-primary">
              <Crown className="h-5 w-5 text-accent-yellow" />
              Pro{plan ? ` · ${plan.label}` : ""}
            </span>
            <span className="mt-1 block text-xs text-content-secondary">
              {expiresAt
                ? `${daysLeft} kun qoldi · ${formatExpiry(expiresAt)}`
                : "Muddatsiz faol"}
            </span>
          </Link>
        ) : (
          <Link
            href="/upgrade"
            className="flex items-center gap-2 rounded-[var(--radius)] bg-gradient-to-r from-accent/20 to-accent-purple/20 px-3 py-2.5 text-sm font-semibold text-content-primary transition-colors hover:from-accent/30 hover:to-accent-purple/30"
          >
            <Crown className="h-5 w-5 text-accent-yellow" />
            Upgrade
          </Link>
        )}
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
