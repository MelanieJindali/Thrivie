"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ActionResult } from "@/app/actions";

type Toast = { id: number; message: string; undo?: () => void; tone?: "ok" | "error" };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Toasts (bottom of screen, above the tab bar). Announced to screen readers. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.undo ? 5200 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex flex-col items-center gap-2 px-4 md:bottom-8" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`t-toast pointer-events-auto flex max-w-full items-center gap-3 rounded-full py-2 pr-2 pl-5 text-sm font-semibold shadow-lift ${t.tone === "error" ? "bg-terracotta-ink text-primary-text" : "bg-text text-bg"}`}>
            <span className="min-w-0">{t.message}</span>
            {t.undo ? (
              <button className="min-h-10 rounded-full bg-aqua px-4 text-sm font-bold text-[#0E1B24]" onClick={() => { t.undo!(); setToasts((xs) => xs.filter((x) => x.id !== t.id)); }}>
                Undo
              </button>
            ) : <span className="w-3" />}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Delete with Undo instead of a confirmation dialog: the row disappears at once,
 * and the delete is committed after 5 seconds (or immediately if the page is
 * closed) unless Undo is tapped.
 */
export function UndoDeleteButton({ action, label = "Delete", what = "Entry", className = "btn-ghost px-3 text-xs" }: {
  action: () => Promise<ActionResult>; label?: string; what?: string; className?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; flush: () => void } | null>(null);
  useEffect(() => () => pending.current?.flush(), []);

  function onClick() {
    const row = ref.current?.closest<HTMLElement>("li,[data-row]");
    if (row) row.hidden = true;
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      window.removeEventListener("pagehide", flush);
      const r = await action();
      if (!r.ok) {
        if (row) row.hidden = false;
        toast({ message: r.error, tone: "error" });
      } else router.refresh();
    };
    const flush = () => { clearTimeout(timer); void commit(); };
    const timer = setTimeout(commit, 5000);
    window.addEventListener("pagehide", flush);
    pending.current = { timer, flush };
    toast({
      message: `${what} deleted`,
      undo: () => {
        done = true;
        clearTimeout(timer);
        window.removeEventListener("pagehide", flush);
        if (row) row.hidden = false;
        pending.current = null;
      },
    });
  }
  return (
    <button ref={ref} type="button" className={className} onClick={onClick} aria-label={`${label} ${what.toLowerCase()}`}>
      <Trash2 size={14} aria-hidden /> <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}
