"use client";

// Device-side helpers for the scanner: the barcode engine (loaded on first use), a small
// on-device copy of looked-up products so repeat scans work offline, and success feedback.
import type { Food } from "@/lib/nutrition/food";
import { parseBarcode, type BarcodeFormat } from "@/lib/nutrition/barcode";

export type Lookup = { status: "found"; food: Food } | { status: "not_found" } | { status: "unavailable" } | { status: "invalid"; error: string };

const CACHE_KEY = "thrivie:scanned-foods:v1";
const CACHE_MAX = 150;
type Cache = Record<string, Food>;
const readCache = (): Cache => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Cache; } catch { return {}; } };
function remember(barcode: string, food: Food) {
  try {
    const c = readCache();
    delete c[barcode];
    c[barcode] = food; // newest last
    const keys = Object.keys(c);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete c[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* storage full or blocked: scanning still works online */ }
}
/** Looks a barcode up: Thrivie's server first, then this device's copy when offline. */
export async function lookup(code: string, hint?: BarcodeFormat): Promise<Lookup & { barcode?: string }> {
  const parsed = parseBarcode(code, hint);
  if (!parsed.ok) return { status: "invalid", error: parsed.error };
  const barcode = parsed.lookup;
  try {
    const res = await fetch(`/api/foods/barcode/${barcode}`);
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as Lookup;
    if (body.status === "found") remember(barcode, body.food);
    if (body.status !== "unavailable") return { ...body, barcode };
  } catch { /* offline: fall through to the device copy */ }
  const local = readCache()[barcode];
  return local ? { status: "found", food: local, barcode } : { status: "unavailable", barcode };
}

const HINT: Record<string, BarcodeFormat> = { ean_13: "ean13", ean_8: "ean8", upc_a: "upca", upc_e: "upce" };
type Detected = { rawValue: string; format: string };
let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (hits: Detected[]) => void>();

/** The barcode reader runs in a Web Worker (started on first use), so reading never blocks the screen. */
function reader(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./barcode.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; hits: Detected[] }>) => { waiting.get(e.data.id)?.(e.data.hits); waiting.delete(e.data.id); };
    worker.onerror = () => { for (const done of waiting.values()) done([]); waiting.clear(); worker?.terminate(); worker = null; };
  }
  return worker;
}

/** The first valid food barcode in an image or video frame, or null. The bitmap is handed over and closed. */
export async function detectBarcode(bitmap: ImageBitmap): Promise<{ code: string; hint: BarcodeFormat } | null> {
  const id = ++nextId;
  const found = await new Promise<Detected[]>((resolve) => { waiting.set(id, resolve); reader().postMessage({ id, bitmap }, [bitmap]); });
  for (const d of found) {
    const hint = HINT[d.format];
    if (hint && parseBarcode(d.rawValue, hint).ok) return { code: d.rawValue, hint };
  }
  return null;
}

/** A short vibration and a soft beep. Phones on silent stay silent; iPhones don't vibrate for websites. */
export function successFeedback() {
  try { navigator.vibrate?.(60); } catch { /* not supported */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => void ctx.close();
  } catch { /* sound is a nicety */ }
}
