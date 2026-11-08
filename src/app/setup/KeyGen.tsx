"use client";

import { useEffect, useState } from "react";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export function KeyGen() {
  const [keys, setKeys] = useState<{ name: string; value: string; note: string }[]>([]);
  useEffect(() => {
    const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
    setKeys([
      { name: "ENCRYPTION_KEY", value: b64(rand(32)), note: "Encrypts journal entries, notes, photos and voice notes. Keep it safe: without it that data can't be read." },
      { name: "CRON_SECRET", value: b64(rand(24)).replace(/[+/=]/g, ""), note: "Lets your scheduler trigger daily reminders." },
      { name: "SIGNUP_CODE", value: b64(rand(6)).replace(/[+/=]/g, "").toLowerCase(), note: "Share with the people you invite. Only they can create accounts." },
    ]);
  }, []);
  return (
    <ul className="space-y-4">
      {keys.map((k) => (
        <li key={k.name} className="card space-y-2">
          <p className="label">{k.name}</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm break-all">{k.value}</code>
            <button className="btn-soft" onClick={() => navigator.clipboard?.writeText(k.value).catch(() => {})}>Copy</button>
          </div>
          <p className="text-xs text-muted">{k.note}</p>
        </li>
      ))}
    </ul>
  );
}
