"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { OFFLINE_EVENT, pendingCount } from "@/lib/offlineQueue";

/** Clear offline indicator and sync status. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const update = async () => {
      setOnline(navigator.onLine);
      setPending(await pendingCount());
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(OFFLINE_EVENT, update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(OFFLINE_EVENT, update);
    };
  }, []);
  if (online && !pending) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl bg-gold-soft px-4 py-2.5 text-sm font-semibold text-gold-ink" role="status">
      {online ? <RefreshCw size={15} className="animate-spin" aria-hidden /> : <CloudOff size={15} aria-hidden />}
      {online ? `Syncing ${pending} saved change${pending === 1 ? "" : "s"}…` : `You're offline. ${pending ? `${pending} change${pending === 1 ? "" : "s"} will sync when you're back online.` : "New entries will be saved on this device and synced later."}`}
    </div>
  );
}
