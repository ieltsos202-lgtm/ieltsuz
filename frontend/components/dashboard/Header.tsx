"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, CheckCheck, LogOut, Menu, Moon, Sun, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/ThemeProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { daysUntil } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}

export function Header({ onMenuToggle, menuOpen }: HeaderProps) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const days = daysUntil(profile?.exam_date);
  const initials = (profile?.full_name || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const handleNotifClick = (id: string) => {
    markAsRead([id]);
  };

  const handleMarkAll = () => {
    markAllAsRead();
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-bg-primary/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="rounded-full p-2 text-content-secondary hover:bg-bg-tertiary hover:text-content-primary"
            title={menuOpen ? "Close sidebar" : "Open sidebar"}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
        <span className="text-lg font-extrabold gradient-text">
          IELTSUZ
        </span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        {days !== null && (
          <div className="hidden items-center gap-2 rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-sm text-content-secondary sm:flex">
            <CalendarClock className="h-4 w-4 text-accent-yellow" />
            {days} days left
          </div>
        )}
        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-full p-2 text-content-secondary hover:bg-bg-tertiary hover:text-content-primary"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-red px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-10 z-40 w-80 rounded-xl border border-border bg-bg-primary p-2 shadow-lg">
                <div className="mb-2 flex items-center justify-between px-2 pt-1">
                  <p className="text-sm font-semibold text-content-primary">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAll}
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <CheckCheck className="h-3 w-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-content-secondary">
                      No notifications yet
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n.id)}
                        className={`w-full rounded-lg p-2.5 text-left transition-colors hover:bg-bg-tertiary/50 ${
                          n.read ? "opacity-60" : "bg-accent/5"
                        }`}
                      >
                        <p className="text-xs font-semibold text-content-primary">{n.title}</p>
                        <p className="mt-0.5 text-xs text-content-secondary">{n.message}</p>
                        <p className="mt-1 text-[10px] text-content-tertiary">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <button
          onClick={toggleTheme}
          className="rounded-full p-2 text-content-secondary hover:bg-bg-tertiary hover:text-content-primary"
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-purple text-sm font-semibold text-white">
            {initials}
          </div>
          <span className="hidden text-sm font-medium md:block">
            {profile?.full_name || "User"}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
