"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, SquarePlus, ClipboardPaste, ChartNoAxesColumn, CircleUserRound, HeartPulse, Dumbbell, CircleCheck, Target, NotebookPen, CalendarHeart, LogOut } from "lucide-react";
import type { ModuleKey } from "@/lib/settings";
import { BrandMark, Wordmark } from "./Brand";
import { signOut } from "@/app/authActions";
import { clearDeviceData } from "./OfflineSync";

// Five destinations everywhere: Today, Log, Import, Insights, Me.
// Phones: frosted bottom tab bar. Tablets/desktops: a side rail with the
// modules listed under Log, so the extra space is used instead of stretched.
const MAIN = [
  { href: "/", label: "Today", icon: Sun, match: (p: string) => p === "/" },
  { href: "/log", label: "Log", icon: SquarePlus, match: (p: string) => ["/log", "/health", "/workouts", "/habits", "/goals", "/journal"].some((x) => p.startsWith(x)) },
  { href: "/import", label: "Import", icon: ClipboardPaste, match: (p: string) => p.startsWith("/import") },
  { href: "/insights", label: "Insights", icon: ChartNoAxesColumn, match: (p: string) => p.startsWith("/insights") || p.startsWith("/review") },
  { href: "/me", label: "Me", icon: CircleUserRound, match: (p: string) => p.startsWith("/me") || p.startsWith("/privacy") },
] as const;

const MODULES = [
  { href: "/health", label: "Health", icon: HeartPulse, module: "health" },
  { href: "/workouts", label: "Workouts", icon: Dumbbell, module: "workouts" },
  { href: "/habits", label: "Habits", icon: CircleCheck, module: "habits" },
  { href: "/goals", label: "Goals", icon: Target, module: "goals" },
  { href: "/journal", label: "Journal", icon: NotebookPen, module: "journal" },
] as const;

export function Nav({ visible, email }: { visible: ModuleKey[]; email: string }) {
  const path = usePathname();
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-4 py-7 md:flex" aria-label="Main navigation">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <BrandMark />
          <Wordmark className="text-xl text-text" />
        </Link>
        <nav className="flex flex-col gap-1">
          {MAIN.map(({ href, label, icon: Icon, match }) => {
            const active = match(path);
            return (
              <div key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm transition ${
                    active ? "bg-surface font-bold text-text shadow-soft" : "text-muted hover:bg-surface/70 hover:text-text"
                  }`}
                >
                  {active && <span aria-hidden className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full bg-aqua shadow-[0_0_10px_var(--aqua)]" />}
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {label}
                </Link>
                {href === "/log" && (
                  <div className="mt-1 mb-2 ml-6 flex flex-col border-l border-border pl-3">
                    {MODULES.filter((m) => visible.includes(m.module)).map(({ href: h, label: l, icon: I }) => (
                      <Link key={h} href={h} aria-current={path.startsWith(h) ? "page" : undefined}
                        className={`flex min-h-10 items-center gap-2.5 rounded-xl px-2 text-[13px] ${path.startsWith(h) ? "font-bold text-text" : "text-muted hover:text-text"}`}>
                        <I size={15} aria-hidden /> {l}
                      </Link>
                    ))}
                    <Link href="/review" aria-current={path.startsWith("/review") ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-2.5 rounded-xl px-2 text-[13px] ${path.startsWith("/review") ? "font-bold text-text" : "text-muted hover:text-text"}`}>
                      <CalendarHeart size={15} aria-hidden /> Weekly review
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-surface/70 p-4 text-xs text-muted">
          <p className="font-display text-sm font-semibold text-text">Private to you</p>
          <p className="mt-1 truncate" title={email}>{email}</p>
          <form action={signOut} onSubmit={() => { void clearDeviceData(); }} className="mt-2">
            <button className="inline-flex min-h-9 items-center gap-1.5 font-bold text-primary hover:underline">
              <LogOut size={13} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="glass mx-auto grid max-w-md grid-cols-5 rounded-[1.75rem] p-1.5">
          {MAIN.map(({ href, label, icon: Icon, match }) => {
            const active = match(path);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] text-text ${active ? "font-bold" : "font-medium"}`}>
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                {label}
                {active && <span aria-hidden className="absolute bottom-1 h-[3px] w-5 rounded-full bg-aqua shadow-[0_0_10px_var(--aqua)]" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
