"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, ImageUp, Keyboard } from "lucide-react";
import type { Food } from "@/lib/nutrition/food";
import { detectBarcode, lookup, successFeedback, type Lookup } from "./scanLib";

type CamState = "idle" | "starting" | "live" | "denied" | "unavailable";
const SCAN_EVERY_MS = 160; // about six looks a second
const SCAN_WIDTH = 640; // frames are shrunk before reading

/** Live barcode scanning, with typed-number and photo options that never need the camera. */
export function BarcodeScanner({ onFood, onMissing }: { onFood: (f: Food) => void; onMissing: (barcode: string | null, why: "not_found" | "unavailable") => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const [cam, setCam] = useState<CamState>("idle");
  const [torch, setTorch] = useState<boolean | null>(null); // null: not supported
  const [status, setStatus] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [showTyped, setShowTyped] = useState(false);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setTorch(null);
    setCam((c) => (c === "live" || c === "starting" ? "idle" : c));
  }, []);

  const handle = useCallback(async (result: Lookup & { barcode?: string }) => {
    if (result.status === "found") { successFeedback(); onFood(result.food); }
    else if (result.status === "invalid") setStatus(result.error);
    else onMissing(result.barcode ?? null, result.status);
  }, [onFood, onMissing]);

  const tick = useCallback(async () => {
    const v = video.current;
    if (!v || !stream.current) return;
    if (!busy.current && v.readyState >= 2 && v.videoWidth) {
      busy.current = true;
      try {
        // Read a reduced-size frame: plenty for a barcode, and far less work per look.
        const scale = Math.min(1, SCAN_WIDTH / v.videoWidth);
        const frame = await createImageBitmap(v, { resizeWidth: Math.round(v.videoWidth * scale), resizeHeight: Math.round(v.videoHeight * scale) });
        const hit = await detectBarcode(frame); // read in a worker; the frame is handed over
        if (hit && stream.current) {
          stop();
          setStatus("Looking it up…");
          await handle(await lookup(hit.code, hit.hint));
          setStatus(null);
          busy.current = false;
          return;
        }
      } catch { /* a frame that couldn't be read: try the next one */ }
      busy.current = false;
    }
    timer.current = setTimeout(tick, SCAN_EVERY_MS);
  }, [handle, stop]);

  const start = useCallback(async () => {
    setStatus(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCam("unavailable"); return; }
    setCam("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setCam("live");
      timer.current = setTimeout(tick, SCAN_EVERY_MS);
    } catch (e) {
      setCam(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "unavailable");
    }
  }, [tick]);

  // If the camera was allowed before, start straight away; otherwise wait for a tap (the explanation comes first).
  useEffect(() => {
    let cancelled = false;
    navigator.permissions?.query({ name: "camera" as PermissionName }).then((p) => { if (!cancelled && p.state === "granted") void start(); }).catch(() => {});
    // The camera goes off the moment the scanner closes or the app goes to the background.
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch == null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  }

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    stop();
    setStatus("Reading the photo…");
    try {
      const bmp = await createImageBitmap(file);
      const hit = await detectBarcode(bmp);
      if (!hit) { setStatus("No barcode found in that photo. Try a closer, sharper shot, or type the number."); return; }
      setStatus("Looking it up…");
      await handle(await lookup(hit.code, hit.hint));
      setStatus(null);
    } catch { setStatus("That photo couldn't be read. Try another, or type the number."); }
  }

  async function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    stop();
    setStatus("Looking it up…");
    const r = await lookup(typed);
    setStatus(null);
    await handle(r);
  }

  const live = cam === "live" || cam === "starting";
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-[#0C1B30] text-white" style={{ aspectRatio: "4 / 3" }}>
        <video ref={video} className={`h-full w-full object-cover ${live ? "" : "hidden"}`} playsInline muted aria-label="Camera view" />
        {live && (
          <>
            <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[38%] -translate-y-1/2 rounded-2xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgb(12_27_48/0.45)]" aria-hidden />
            <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold drop-shadow">Line the barcode up in the frame</p>
            {torch != null && (
              <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label={torch ? "Turn the light off" : "Turn the light on"}
                className="absolute top-3 right-3 grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white">
                {torch ? <FlashlightOff size={20} aria-hidden /> : <Flashlight size={20} aria-hidden />}
              </button>
            )}
          </>
        )}
        {!live && (
          <div className="absolute inset-0 grid place-items-center p-5 text-center">
            <div className="max-w-xs space-y-3">
              {cam === "denied" ? (
                <p className="text-sm">Camera access is off for Thrivie. You can still type the barcode, choose a photo, or search by name. To use the camera, allow it in your browser&apos;s site settings.</p>
              ) : cam === "unavailable" ? (
                <p className="text-sm">No camera is available here. Type the barcode, choose a photo, or search by name instead.</p>
              ) : (
                <p className="text-sm">Thrivie uses your camera only to read the barcode. The picture stays on your device.</p>
              )}
              {cam !== "unavailable" && (
                <button type="button" className="btn bg-white text-[#0C1B30]" onClick={start}><Camera size={18} aria-hidden /> {cam === "denied" ? "Try the camera again" : "Start camera"}</button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="min-h-5 text-sm font-semibold" role="status" aria-live="polite">{status}</p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-soft" aria-expanded={showTyped} onClick={() => setShowTyped((s) => !s)}><Keyboard size={16} aria-hidden /> Type the barcode</button>
        <label className="btn-soft cursor-pointer">
          <ImageUp size={16} aria-hidden /> Choose a photo
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void fromPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {live && <button type="button" className="btn-ghost" onClick={stop}>Stop camera</button>}
      </div>

      {showTyped && (
        <form onSubmit={submitTyped} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-56">
            <span className="label">Barcode number</span>
            <input className="input" inputMode="numeric" autoComplete="off" pattern="[0-9 \-]*" maxLength={20} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="The 8, 12 or 13 digits under the bars" autoFocus required />
          </label>
          <button className="btn-primary">Look up</button>
        </form>
      )}
    </div>
  );
}
