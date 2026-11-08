"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Bottom sheet on mobile, centered dialog on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="pb-safe relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">{title}</h2>
          <button className="btn-ghost -mr-2 px-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
