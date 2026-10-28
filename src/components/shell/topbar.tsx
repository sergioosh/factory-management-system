"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Notification, Logout, TickSquare, Warning2, Clock, Sun1, Moon } from "iconsax-reactjs";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { authClient } from "@/lib/auth-client";
import { useDarkMode } from "@/lib/dark-mode";
import { NAV } from "./sidebar";

function currentTitle(pathname: string): string {
  for (const section of NAV) {
    for (const item of section.items) {
      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      if (active) return item.label;
    }
  }
  return "Dashboard";
}

export type Notice = {
  id: number;
  text: string;
  by: string | null;
  at: string; // ISO
};

export function TopBar({
  userName,
  roleName,
  canApprove,
  pendingApprovals,
  lowStock,
  activity,
}: {
  userName: string;
  roleName: string;
  canApprove: boolean;
  pendingApprovals: number;
  lowStock: number;
  activity: Notice[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, toggle } = useDarkMode();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(Number.MAX_SAFE_INTEGER);

  useEffect(() => {
    setLastSeen(Number(localStorage.getItem("notif-seen") ?? 0));
  }, []);

  const unread = activity.filter((a) => new Date(a.at).getTime() > lastSeen).length;
  const badge = unread + pendingApprovals;

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) {
      const now = Date.now();
      localStorage.setItem("notif-seen", String(now));
      // keep current items marked unread until closed
    } else {
      setLastSeen(Number(localStorage.getItem("notif-seen") ?? 0));
    }
  }

  return (
    <header className="no-print sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-line bg-surface px-5">
      <div className="text-[13px]">
        <span className="font-semibold text-ink">{currentTitle(pathname)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="rounded-lg p-2 text-ink-soft hover:bg-black/5 hover:text-ink cursor-pointer"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <Sun1 size={18} /> : <Moon size={18} />}
        </button>
        <Popover.Root open={open} onOpenChange={onOpenChange}>
          <Popover.Trigger asChild>
            <button
              className="relative rounded-lg p-2 text-ink-soft hover:bg-black/5 hover:text-ink cursor-pointer"
              title="Notifications"
            >
              <Notification size={18} />
              {badge > 0 && (
                <span className="num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-semibold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              className="z-50 w-[340px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
            >
              <div className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">
                Notifications
              </div>

              {(pendingApprovals > 0 || lowStock > 0) && (
                <div className="border-b border-line">
                  {pendingApprovals > 0 && canApprove && (
                    <Link
                      href="/approvals"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg"
                    >
                      <TickSquare size={16} className="shrink-0 text-warn" variant="Bold" />
                      <span className="text-[12.5px]">
                        <b>{pendingApprovals}</b> item{pendingApprovals > 1 ? "s" : ""} waiting for
                        approval
                      </span>
                    </Link>
                  )}
                  {lowStock > 0 && (
                    <Link
                      href="/stock/materials"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg"
                    >
                      <Warning2 size={16} className="shrink-0 text-danger" variant="Bold" />
                      <span className="text-[12.5px]">
                        <b>{lowStock}</b> material{lowStock > 1 ? "s" : ""} below minimum stock
                      </span>
                    </Link>
                  )}
                </div>
              )}

              <div className="max-h-72 overflow-y-auto">
                {activity.length === 0 && (
                  <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">
                    No recent activity
                  </p>
                )}
                {activity.map((a) => {
                  const isNew = new Date(a.at).getTime() > lastSeen;
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-start gap-2.5 border-b border-line px-4 py-2.5 last:border-0",
                        isNew && "bg-accent-soft/60",
                      )}
                    >
                      <Clock size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                      <div className="min-w-0">
                        <div className="text-[12.5px] leading-snug">{a.text}</div>
                        <div className="mt-0.5 text-[11px] text-ink-faint">
                          {a.by ? `${a.by} · ` : ""}
                          {fmtDateTime(a.at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link
                href="/audit"
                onClick={() => setOpen(false)}
                className="block border-t border-line px-4 py-2 text-center text-[12px] text-accent hover:underline"
              >
                Full audit log
              </Link>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <div className="h-6 w-px bg-line" />

        <div className="text-right leading-tight">
          <div className="text-[12.5px] font-semibold">{userName}</div>
          <div className="text-[11px] text-ink-faint">{roleName || "No role"}</div>
        </div>
        <button
          title="Sign out"
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft hover:bg-bg hover:text-ink cursor-pointer"
        >
          <Logout size={14} /> Sign out
        </button>
      </div>
    </header>
  );
}
