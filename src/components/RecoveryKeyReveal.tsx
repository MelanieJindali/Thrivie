"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Shows a recovery key once, with a copy button. */
export function RecoveryKeyReveal({ value, intro }: { value: string; intro?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the key is selectable text, so it can still be copied by hand.
    }
  }
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border bg-surface-2/50 p-4">
      {intro && <p className="text-sm">{intro}</p>}
      <p className="font-mono text-lg font-bold tracking-wider break-all select-all">{value}</p>
      <button type="button" className="btn-soft min-h-11 text-sm" onClick={copy}>
        {copied ? <><Check size={15} aria-hidden /> Copied</> : <><Copy size={15} aria-hidden /> Copy key</>}
      </button>
      <p className="text-xs text-muted">Store it in a password manager or somewhere private. Anyone with this key and your email can reset your password.</p>
    </div>
  );
}
