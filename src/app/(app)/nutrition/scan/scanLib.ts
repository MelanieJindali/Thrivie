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

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
const HINT: Record<string, BarcodeFormat> = { ean_13: "ean13", ean_8: "ean8", upc_a: "upca", upc_e: "upce" };
type Detected = { rawValue: string; format: string };
type Detector = { detect: (source: ImageBitmapSource) => Promise<Detected[]> };
let detector: Promise<Detector> | null = null;

/** The browser's own barcode reader where it exists; otherwise a small WebAssembly one, served by Thrivie. */
export function getDetector(): Promise<Detector> {
  detector ??= (async () => {
    const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
      } catch { /* fall back */ }
    }
    const mod = await import("barcode-detector/ponyfill");
    mod.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/vendor/zxing/zxing_reader.wasm" : prefix + path) } });
    return new mod.BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector;
  })();
  detector.catch(() => { detector = null; });
  return detector;
}

/** The first valid food barcode in an image or video frame, or null. */
export async function detectBarcode(source: ImageBitmapSource): Promise<{ code: string; hint: BarcodeFormat } | null> {
  const found = await (await getDetector()).detect(source);
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
