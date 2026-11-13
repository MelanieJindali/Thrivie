"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addGoalProgress, quickCheckin, saveHealthLog, saveJournal, saveMeal, saveWorkout, setHabitCheck, setHabitCount, type ActionResult } from "@/app/actions";
import { logFoods } from "@/app/foodActions";
import { allItems, clearQueue, enqueue, isNetworkError, remove } from "@/lib/offlineQueue";

/** Smart Import save. A plain fetch, so a dropped connection throws and the reviewed entries are queued. */
async function importCommit(body: { items: unknown[]; aliases: unknown[] }): Promise<ActionResult & { saved?: Record<string, number> }> {
  const res = await fetch("/api/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; saved?: Record<string, number> };
  return res.ok ? { ok: true, saved: json.saved } : { ok: false, error: json.error ?? "Saving failed. Nothing was changed." };
}

// Only idempotent or append-only actions may be queued offline.
const ACTIONS = { saveHealthLog, saveWorkout, saveMeal, saveJournal, setHabitCheck, setHabitCount, addGoalProgress, importCommit, logFoods, quickCheckin } as const;
export type OfflineAction = keyof typeof ACTIONS;

type Runner = <K extends OfflineAction>(name: K, ...args: Parameters<(typeof ACTIONS)[K]>) => Promise<ActionResult & { queued?: boolean }>;
const Ctx = createContext<Runner | null>(null);

/** Run a save now, or queue it on this device if offline. */
export function useOfflineAction(): Runner {
  const r = useContext(Ctx);
  return r ?? (async (name, ...args) => (ACTIONS[name] as (...a: unknown[]) => Promise<ActionResult>)(...args));
}

export function OfflineSync({ owner, children }: { owner: string; children: React.ReactNode }) {
  const router = useRouter();
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      let any = false;
      for (const item of await allItems()) {
        if (item.owner !== owner) continue; // never replay another account's entries
        const fn = ACTIONS[item.action as OfflineAction] as ((...a: unknown[]) => Promise<ActionResult>) | undefined;
        if (!fn) { await remove(item.id); continue; }
        try {
          await fn(...item.args);
          await remove(item.id);
          any = true;
        } catch (e) {
          if (isNetworkError(e)) break; // still offline; try again later
          await remove(item.id); // invalid item: drop it rather than retry forever
        }
      }
      if (any) router.refresh();
    } finally {
      flushing.current = false;
    }
  }, [owner, router]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    const t = setInterval(flush, 30_000);
    return () => { window.removeEventListener("online", flush); clearInterval(t); };
  }, [flush]);

  const run: Runner = useCallback(async (name, ...args) => {
    const fn = ACTIONS[name] as (...a: unknown[]) => Promise<ActionResult>;
    if (!navigator.onLine) {
      await enqueue(owner, name, args);
      return { ok: true, queued: true };
    }
    try {
      return await fn(...args);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      await enqueue(owner, name, args);
      return { ok: true, queued: true };
    }
  }, [owner]);

  return <Ctx.Provider value={run}>{children}</Ctx.Provider>;
}

/** Called on sign-out: forget queued entries and cached pages on this device. */
export async function clearDeviceData() {
  await clearQueue();
  try { localStorage.removeItem("thrivie:scanned-foods:v1"); } catch { /* nothing stored */ } // products scanned on this device
  try {
    // Only Thrivie's page caches (personal pages).
    if ("caches" in window) for (const k of await caches.keys()) if (k.startsWith("thrivie")) await caches.delete(k);
  } catch {}
}
