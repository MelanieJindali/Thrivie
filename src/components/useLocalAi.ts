"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AiTier } from "@/services/localAi";

type Info = { tier: AiTier | null; ready: boolean; sizeMb: number } | null;
type Snapshot = { state: string; progress: { pct: number; sizeMb: number } | null };
const IDLE: Snapshot = { state: "idle", progress: null };
let api: typeof import("@/services/localAi") | null = null;
let snapshot: Snapshot = IDLE;
const subscribe = (cb: () => void) => {
  let off = () => {};
  let live = true;
  void import("@/services/localAi").then((m) => {
    if (!live) return;
    api = m;
    const sync = () => { const s = m.getAiState(); if (s.state !== snapshot.state || s.progress !== snapshot.progress) { snapshot = s; cb(); } };
    off = m.onAiState(sync);
    sync();
  });
  return () => { live = false; off(); };
};

/**
 * What the on-device AI can do here, for the small status lines in the UI. Nothing is loaded
 * (not even the service's code) unless the feature is turned on.
 */
export function useLocalAi(enabled: boolean) {
  const [info, setInfo] = useState<Info>(null);
  const live = useSyncExternalStore(enabled ? subscribe : () => () => {}, () => snapshot, () => IDLE);
  useEffect(() => {
    if (!enabled) { setInfo(null); return; }
    let on = true;
    void import("@/services/localAi").then(async (m) => {
      const plan = await m.getPlan();
      const ready = plan ? await m.isAiReady() : false;
      if (on) setInfo({ tier: plan?.tier ?? null, ready, sizeMb: plan ? m.downloadSizeMb(plan) : 0 });
    }).catch(() => { if (on) setInfo({ tier: null, ready: false, sizeMb: 0 }); });
    return () => { on = false; };
  }, [enabled, live.state]);

  const unsupported = enabled && (live.state === "unsupported" || (info !== null && info.tier === null));
  const status =
    unsupported ? "On-device AI unsupported on this browser"
    : live.state === "downloading" && live.progress ? `Downloading offline AI (${live.progress.sizeMb} MB): ${live.progress.pct}%…`
    : live.state === "loading" ? "Starting on-device AI…"
    : null;
  return {
    supported: enabled && !!info?.tier && !unsupported,
    tier: info?.tier ?? null,
    ready: !!info?.ready || live.state === "ready",
    sizeMb: info?.sizeMb ?? 0,
    downloading: live.state === "downloading" ? live.progress : null,
    status,
    /** Start work without being asked: only when nothing needs downloading and the device isn't a phone. */
    autoRun: enabled && !unsupported && !!info?.tier && info.tier !== "mobile" && info.ready,
    release: () => api?.release(),
  };
}
