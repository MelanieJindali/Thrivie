"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, HeartPulse, Dumbbell, CircleCheck, Target, NotebookPen, Sparkles, Settings, LayoutGrid,
} from "lucide-react";
import type { ModuleKey } from "@/lib/settings";
import { THEME, type ThemeKey } from "@/lib/constants";
import { BrandMark } from "./Brand";

const ITEMS = [
  { href: "/", label: "Today", icon: Home, theme: "today" },
  { href: "/health", label: "Health", icon: HeartPulse, module: "health", theme: "health" },
  { href: "/workouts", label: "Workouts", icon: Dumbbell, module: "workouts", theme: "workouts" },
  { href: "/habits", label: "Habits", icon: CircleCheck, module: "habits", theme: "habits" },
  { href: "/goals", label: "Goals", icon: Target, module: "goals", theme: "goals" },
  { href: "/journal", label: "Journal", icon: NotebookPen, module: "journal", theme: "journal" },
  { href: "/import", label: "AI Import", icon: Sparkles, theme: "import" },
  { href: "/settings", label: "Settings", icon: Settings, theme: "settings" },
] as const;

export function Nav({ visible }: { visible: ModuleKey[] }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => !("module" in i) || visible.includes(i.module));
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const mobileMain = items.filter((i) => i.href !== "/settings" && i.href !== "/import").slice(0, 4);
  const moreActive = !mobileMain.some((i) => isActive(i.href));

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-4 py-7 md:flex">
        <Link href="/" className="mb-9 flex items-center gap-3 px-2">
          <BrandMark />
          <span className="font-display text-2xl font-semibold tracking-tight">Thrivie</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon, theme }) => {
            const active = isActive(href);
            const t = THEME[theme as ThemeKey];
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-surface font-semibold text-text shadow-soft" : "text-muted hover:bg-surface/60 hover:text-text"
                }`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-xl transition ${active ? `${t.soft} ${t.text}` : t.hover}`}>
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-linear-to-br from-gold-soft to-surface p-4 text-xs text-muted">
          <p className="font-display text-sm font-semibold text-text">Private by design</p>
          <p className="mt-1">Your data stays on this device.</p>
        </div>
      </aside>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3 pb-3 md:hidden">
        <div className="mx-auto flex max-w-md justify-around rounded-[1.75rem] border border-border/70 bg-surface/85 px-1 shadow-lift backdrop-blur-xl">
          {mobileMain.map(({ href, label, icon: Icon, theme }) => {
            const active = isActive(href);
            const t = THEME[theme as ThemeKey];
            return (
              <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${active ? t.text : "text-muted"}`}>
                <span className={`grid h-8 w-11 place-items-center rounded-full transition ${active ? t.soft : ""}`}>
                  <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
          <Link href="/more" className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${moreActive ? "text-primary" : "text-muted"}`}>
            <span className={`grid h-8 w-11 place-items-center rounded-full ${moreActive ? "bg-primary-soft" : ""}`}>
              <LayoutGrid size={20} strokeWidth={moreActive ? 2.3 : 1.8} />
            </span>
            More
          </Link>
        </div>
      </nav>
    </>
  );
}
