"use client";

import { useState } from "react";
import { Camera, ImageUp } from "lucide-react";
import { parseLabel, type LabelRead } from "@/lib/nutrition/labelParse";

const MAX_SIDE = 1800;

/**
 * Cleans a label photo for reading, on the device: shrink, greyscale, stretch the contrast,
 * and crop away plain borders. Returns a canvas.
 */
export async function prepareLabelImage(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const grey = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; grey[p] = g; hist[grey[p]]++; }
  // Contrast stretch between the 3rd and 97th percentile, so dim or washed-out photos read better.
  const at = (frac: number) => { let acc = 0; const want = w * h * frac; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= want) return v; } return 255; };
  const lo = at(0.03), hi = Math.max(lo + 1, at(0.97));
  for (let p = 0; p < grey.length; p++) grey[p] = Math.max(0, Math.min(255, ((grey[p] - lo) * 255) / (hi - lo)));
  // Crop to the area that has detail: rows and columns whose pixels barely vary are plain background.
  const varies = (get: (i: number) => number, n: number) => { let min = 255, max = 0; for (let i = 0; i < n; i += 4) { const v = get(i); if (v < min) min = v; if (v > max) max = v; } return max - min > 60; };
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < bottom && !varies((x) => grey[top * w + x], w)) top++;
  while (bottom > top && !varies((x) => grey[bottom * w + x], w)) bottom--;
  while (left < right && !varies((y) => grey[y * w + left], h)) left++;
  while (right > left && !varies((y) => grey[y * w + right], h)) right--;
  const pad = 8;
  top = Math.max(0, top - pad); left = Math.max(0, left - pad); bottom = Math.min(h - 1, bottom + pad); right = Math.min(w - 1, right + pad);
  const cw = right - left + 1, ch = bottom - top + 1;
  const useCrop = cw > w * 0.3 && ch > h * 0.3; // never crop down to a sliver
  const ox = useCrop ? left : 0, oy = useCrop ? top : 0, ow = useCrop ? cw : w, oh = useCrop ? ch : h;
  const out = document.createElement("canvas");
  out.width = ow; out.height = oh;
  const octx = out.getContext("2d")!;
  const o = octx.createImageData(ow, oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const g = grey[(y + oy) * w + (x + ox)]; const i = (y * ow + x) * 4; o.data[i] = o.data[i + 1] = o.data[i + 2] = g; o.data[i + 3] = 255; }
  octx.putImageData(o, 0, 0);
  return out;
}

/** Reads text from a prepared label image with Tesseract, in a Web Worker, entirely on the device. */
export async function readLabelText(image: HTMLCanvasElement, onProgress?: (fraction: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract", langPath: "/vendor/tesseract/lang", gzip: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") onProgress?.(m.progress); },
  });
  try {
    const { data } = await worker.recognize(image, { rotateAuto: true });
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** Photograph or choose a Nutrition Facts label; the values are read here and handed on for review. */
export function LabelScanner({ onRead }: { onRead: (label: LabelRead) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "reading">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function read(file: File | undefined) {
    if (!file) return;
    setMessage(null); setProgress(0); setState("loading");
    try {
      const image = await prepareLabelImage(file);
      setState("reading");
      const text = await readLabelText(image, setProgress);
      const label = parseLabel(text);
      if (!label.perServing && !label.per100g) {
        setMessage("Couldn't find nutrition values in that photo. Try again with the whole label in view, flat and well lit, or enter the values yourself.");
        setState("idle");
        return;
      }
      setState("idle");
      onRead(label);
    } catch {
      setMessage("The label reader couldn't start on this device. You can enter the values yourself.");
      setState("idle");
    }
  }
  const busy = state !== "idle";
  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-surface-2/60 p-5">
        <p className="text-sm">Take a clear photo of the Nutrition Facts panel: the whole label in view, flat, without glare. Thrivie reads it on your device and shows the values for a quick check before anything is saved.</p>
        <p className="mt-2 text-xs text-muted">The first time, the reader downloads about 7 MB and is then kept on your device.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <Camera size={18} aria-hidden /> Photograph the label
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={`btn-soft cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <ImageUp size={16} aria-hidden /> Choose a photo
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <div role="status" aria-live="polite">
        {state === "loading" && <p className="text-sm font-semibold">Getting the photo ready…</p>}
        {state === "reading" && (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Reading the label… {Math.round(progress * 100)}%</p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Reading the label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
          </div>
        )}
        {message && <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">{message}</p>}
      </div>
    </div>
  );
}
