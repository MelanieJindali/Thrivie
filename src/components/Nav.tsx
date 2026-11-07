"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, HeartPulse, Dumbbell, CircleCheck, Target, NotebookPen, Sparkles, Settings, LayoutGrid,
} from "lucide-react";
import type { ModuleKey } from "@/lib/settings";

const ITEMS = [
  { href: "/", label: "Today", icon: Home },
  { href: "/health", label: "Health", icon: HeartPulse, module: "health" },
  { href: "/workouts", label: "Workouts", icon: Dumbbell, module: "workouts" },
  { href: "/habits", label: "Habits", icon: CircleCheck, module: "habits" },
  { href: "/goals", label: "Goals", icon: Target, module: "goals" },
  { href: "/journal", label: "Journal", icon: NotebookPen, module: "journal" },
  { href: "/import", label: "AI Import", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Nav({ visible }: { visible: ModuleKey[] }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => !("module" in i) || visible.includes(i.module));
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  // Mobile: Today + up to 3 modules + More
  const mobileMain = items.filter((i) => i.href !== "/settings" && i.href !== "/import").slice(0, 4);
  const moreActive = !mobileMain.some((i) => isActive(i.href));

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-border px-3 py-6 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-text">🌱</span>
          Thrivie
        </Link>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              isActive(href) ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </aside>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {mobileMain.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${isActive(href) ? "text-primary" : "text-muted"}`}
            >
              <Icon size={22} strokeWidth={isActive(href) ? 2.2 : 1.8} />
              {label}
            </Link>
          ))}
          <Link
            href="/more"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${moreActive ? "text-primary" : "text-muted"}`}
          >
            <LayoutGrid size={22} strokeWidth={moreActive ? 2.2 : 1.8} />
            More
          </Link>
        </div>
      </nav>
    </>
  );
}
