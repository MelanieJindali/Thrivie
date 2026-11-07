"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { deleteJournal, saveJournal } from "@/app/actions";
import { ConfirmButton, Empty, FormStatus, RatingPicker, useAction } from "@/components/ui";
import { JOURNAL_PROMPTS, MOOD_EMOJI } from "@/lib/constants";
import { relativeLabel } from "@/lib/dates";

type Entry = { id: string; date: string; content: string; mood: number | null; prompt: string | null };

export function JournalComposer({ today, initial, onDone, compact = false }: { today: string; initial?: Entry; onDone?: () => void; compact?: boolean }) {
  const [date, setDate] = useState(initial?.date ?? today);
  const [prompt, setPrompt] = useState<string | null>(initial?.prompt ?? null);
  const [content, setContent] = useState(initial?.content ?? "");
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const { pending, error, message, run } = useAction();
  return (
    <form
      className={compact || initial ? "space-y-3" : "card space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveJournal({ id: initial?.id, date, content, mood, prompt }), {
          success: "Saved ✓",
          onOk: () => { if (!initial) { setContent(""); setPrompt(null); setMood(null); } onDone?.(); },
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!initial && !compact && <h2 className="h2">New entry</h2>}
        <input type="date" className="input w-auto py-1.5 text-sm" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {JOURNAL_PROMPTS.map((p) => (
          <button type="button" key={p} className={`chip shrink-0 text-xs ${prompt === p ? "chip-on" : ""}`} onClick={() => setPrompt(prompt === p ? null : p)}>
            {p}
          </button>
        ))}
      </div>
      <textarea
        className="input min-h-32"
        placeholder={prompt ?? "What's on your mind?"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        aria-label="Journal entry"
      />
      <div>
        <span className="label">Mood (optional)</span>
        <RatingPicker name="Mood" value={mood} onChange={setMood} labels={MOOD_EMOJI} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !content.trim()}>{pending ? "Saving…" : "Save entry"}</button>
        {initial && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-warn-soft px-0.5 text-text">{p}</mark> : p));
}

export function JournalList({ entries, today, query }: { entries: Entry[]; today: string; query: string }) {
  const [q, setQ] = useState(query);
  const [editing, setEditing] = useState<string | null>(null);
  const router = useRouter();
  const path = usePathname();
  const { run } = useAction();

  // Debounced search via the URL so results come from the database.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== query) router.replace(q ? `${path}?q=${encodeURIComponent(q)}` : path);
    }, 250);
    return () => clearTimeout(t);
  }, [q, query, path, router]);

  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="h2 flex-1">Entries</h2>
        <label className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input py-2 pl-9 text-sm" placeholder="Search entries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search journal" />
        </label>
      </div>
      {entries.length ? (
        <ul className="space-y-4">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl bg-surface-2 p-4">
              {editing === e.id ? (
                <JournalComposer today={today} initial={e} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-text">{relativeLabel(e.date, today)}</span>
                    {e.mood && <span title={`Mood ${e.mood}/5`}>{MOOD_EMOJI[e.mood - 1]}</span>}
                    {e.prompt && <span className="italic">· {e.prompt}</span>}
                    <span className="ml-auto flex">
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(e.id)}>Edit</button>
                      <ConfirmButton onConfirm={() => run(() => deleteJournal(e.id))} />
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{highlight(e.content, query)}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{query ? `No entries matching “${query}”.` : "No entries yet."}</Empty>
      )}
    </section>
  );
}
