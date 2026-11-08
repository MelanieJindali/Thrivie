"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { saveReminders } from "@/app/actions";
import { FormStatus, useAction } from "@/components/ui";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });

export function ReminderCard({ on, hour, publicKey }: { on: boolean; hour: number; publicKey: string | null }) {
  const [h, setH] = useState(hour);
  const [support, setSupport] = useState<"ok" | "no-sw" | "ios-install" | "checking">("checking");
  const { run, pending, error, message, setError } = useAction();

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) setSupport(ios && !standalone ? "ios-install" : "no-sw");
    else setSupport("ok");
  }, []);

  async function enable() {
    if (!publicKey) return setError("Reminders aren't set up on this server yet (missing VAPID keys).");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setError("Notifications are blocked. Allow them for this site in your browser or phone settings.");
    const reg = await navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) }));
    const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    if (!res.ok) return setError("Couldn't register this device.");
    run(() => saveReminders(true, h), { success: "Reminders on for this device ✓" });
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    run(() => saveReminders(false, h), { success: "Reminders off" });
  }

  async function test() {
    const r = await fetch("/api/push/test", { method: "POST" });
    const j = await r.json();
    if (!r.ok) setError(j.error);
    else if (!j.sent) setError("No devices are subscribed yet. Turn reminders on first.");
    else run(async () => ({ ok: true }), { success: "Test sent — check your notifications." });
  }

  return (
    <section className="card space-y-3">
      <h2 className="h2 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gold-soft text-gold-ink"><BellRing size={16} /></span>
        Daily reminder
      </h2>
      <p className="text-sm text-muted">One gentle nudge a day — only if you still have habits to check off or haven&apos;t logged yet.</p>
      {support === "ios-install" && (
        <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm">On iPhone, first add Thrivie to your Home Screen (Share → Add to Home Screen), then open it from there to turn on reminders.</p>
      )}
      {support === "no-sw" && <p className="text-sm text-terracotta-ink">This browser doesn&apos;t support push notifications.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={h} onChange={(e) => { setH(Number(e.target.value)); if (on) run(() => saveReminders(true, Number(e.target.value)), { success: "Time updated ✓" }); }} aria-label="Reminder time">
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hourLabel(i)}</option>)}
        </select>
        {on ? (
          <>
            <button className="btn-soft" disabled={pending} onClick={disable}>Turn off</button>
            <button className="btn-ghost text-xs" onClick={test}>Send a test</button>
          </>
        ) : (
          <button className="btn-primary" disabled={pending || support !== "ok"} onClick={enable}>Turn on reminders</button>
        )}
      </div>
      <FormStatus error={error} message={message} />
    </section>
  );
}
