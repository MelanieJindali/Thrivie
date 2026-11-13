"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MicOff, Square, Trash2, AudioLines } from "lucide-react";

export type PendingMedia = { key: string; kind: "photo" | "audio"; blob: Blob; url: string; durationS?: number };

/** Resize a photo on the device (max 1600px, JPEG) so uploads stay small. */
export async function resizeImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", quality));
}

export async function uploadMedia(journalId: string, items: PendingMedia[]) {
  for (const m of items) {
    const fd = new FormData();
    fd.set("file", m.blob, m.kind === "photo" ? "photo.jpg" : "voice-note");
    fd.set("kind", m.kind);
    fd.set("journalId", journalId);
    if (m.durationS) fd.set("durationS", String(m.durationS));
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
  }
}

const MAX_RECORD_S = 120;

/** Photo picker, voice recorder and dictation, laid out as a row of pill buttons. */
export function MediaBar({ onAdd, onDictate }: { onAdd: (m: PendingMedia) => void; onDictate: (text: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; start: number; timer: ReturnType<typeof setInterval> } | null>(null);
  const speech = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setCanDictate(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  async function pickPhotos(files: FileList | null) {
    setErr(null);
    for (const f of Array.from(files ?? []).slice(0, 6)) {
      const blob = await resizeImage(f);
      onAdd({ key: crypto.randomUUID(), kind: "photo", blob, url: URL.createObjectURL(blob) });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function startRecording() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const r = rec.current!;
        clearInterval(r.timer);
        const blob = new Blob(chunks, { type: (mr.mimeType || "audio/webm").split(";")[0] });
        onAdd({ key: crypto.randomUUID(), kind: "audio", blob, url: URL.createObjectURL(blob), durationS: (Date.now() - r.start) / 1000 });
        rec.current = null;
        setRecording(false);
      };
      const start = Date.now();
      const timer = setInterval(() => {
        const s = Math.round((Date.now() - start) / 1000);
        setSeconds(s);
        if (s >= MAX_RECORD_S) mr.stop();
      }, 250);
      rec.current = { mr, chunks, start, timer };
      mr.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setErr("Microphone access was blocked. Allow it in your browser settings to record voice notes.");
    }
  }

  function toggleDictation() {
    if (dictating) {
      speech.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, new () => {
      lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void;
      onresult: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void;
      onend: () => void; onerror: () => void;
    }>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const r = new SR();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onDictate(e.results[i][0].transcript.trim());
    };
    r.onend = () => setDictating(false);
    r.onerror = () => setDictating(false);
    speech.current = r;
    r.start();
    setDictating(true);
  }

  const pill = "chip text-xs";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pickPhotos(e.target.files)} />
        <button type="button" className={pill} onClick={() => fileRef.current?.click()}><Camera size={14} className="text-terracotta-ink" /> Photo</button>
        {recording ? (
          <button type="button" className={`${pill} border-terracotta-ink bg-terracotta-soft text-terracotta-ink`} onClick={() => rec.current?.mr.stop()}>
            <Square size={12} fill="currentColor" /> Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </button>
        ) : (
          <button type="button" className={pill} onClick={startRecording}><AudioLines size={14} className="text-iris" /> Voice note</button>
        )}
        {canDictate && (
          <button type="button" className={`${pill} ${dictating ? "border-primary bg-primary-soft text-primary" : ""}`} onClick={toggleDictation}>
            {dictating ? <MicOff size={14} /> : <Mic size={14} className="text-ocean" />} {dictating ? "Stop dictation" : "Dictate"}
          </button>
        )}
      </div>
      {dictating && <p className="text-[11px] text-muted">Listening… speech is converted to text by your browser&apos;s speech service.</p>}
      {err && <p className="text-xs text-terracotta-ink">{err}</p>}
    </div>
  );
}

export function PendingList({ items, onRemove }: { items: PendingMedia[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((m) => (
        <div key={m.key} className="relative">
          {m.kind === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url} alt="" className="h-20 w-20 rounded-2xl object-cover shadow-soft" />
          ) : (
            <audio src={m.url} controls className="h-10 max-w-60" />
          )}
          <button type="button" onClick={() => onRemove(m.key)} aria-label="Remove" className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-surface text-terracotta-ink shadow-soft">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export type SavedAttachment = { id: string; kind: string; durationS: number | null };

export function AttachmentGallery({ items, onDelete }: { items: SavedAttachment[]; onDelete?: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  const photos = items.filter((a) => a.kind === "photo");
  const audio = items.filter((a) => a.kind === "audio");
  return (
    <div className="mt-3 space-y-2">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p.id)} className="overflow-hidden rounded-2xl shadow-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/attachments/${p.id}`} alt="Journal photo" loading="lazy" className="h-24 w-24 object-cover transition hover:scale-105" />
            </button>
          ))}
        </div>
      )}
      {audio.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <audio src={`/api/attachments/${a.id}`} controls preload="none" className="h-10 w-full max-w-sm" />
          {onDelete && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onDelete(a.id)} aria-label="Delete voice note"><Trash2 size={14} /></button>}
        </div>
      ))}
      {open && (
        <div className="t-fade fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/attachments/${open}`} alt="Journal photo" className="t-zoom max-h-[85dvh] max-w-full rounded-2xl" />
          {onDelete && (
            <button className="btn-danger absolute bottom-8" onClick={(e) => { e.stopPropagation(); onDelete(open); setOpen(null); }}>
              <Trash2 size={14} /> Delete photo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
