"use client";
import { useOfflineAction } from "@/components/OfflineSync";

import { UndoDeleteButton } from "@/components/Toast";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { deleteJournal, saveJournal } from "@/app/actions";
import { Empty, FormStatus, RatingPicker, useAction } from "@/components/ui";
import { JOURNAL_PROMPTS, MOOD_EMOJI } from "@/lib/constants";
import { relativeLabel } from "@/lib/dates";
import { AttachmentGallery, MediaBar, PendingList, uploadMedia, type PendingMedia, type SavedAttachment } from "./media";

type Entry = { id: string; date: string; content: string; mood: number | null; prompt: string | null; attachments?: SavedAttachment[] };

export function JournalComposer({ today, initial, onDone, compact = false }: { today: string; initial?: Entry; onDone?: () => void; compact?: boolean }) {
  const [date, setDate] = useState(initial?.date ?? today);
  const [prompt, setPrompt] = useState<string | null>(initial?.prompt ?? null);
  const [content, setContent] = useState(initial?.content ?? "");
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const { pending, error, message, run } = useAction();
  const offline = useOfflineAction();
  const fallbackText = media.some((m) => m.kind === "photo") ? "📷 Photo entry" : media.length ? "🎙️ Voice note" : "";
  return (
    <form
      id={compact || initial ? undefined : "new"}
      className={compact || initial ? "space-y-3" : "card scroll-mt-6 space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          async () => {
            const r = media.length ? await saveJournal({ id: initial?.id, date, content: content.trim() || fallbackText, mood, prompt }) : await offline("saveJournal", { id: initial?.id, date, content: content.trim() || fallbackText, mood, prompt });
            if (r.ok && r.id && media.length) {
              try {
                await uploadMedia(r.id, media);
              } catch (err) {
                return { ok: false as const, error: `Entry saved, but a file didn't upload: ${(err as Error).message}` };
              }
            }
            return r;
          },
          {
            success: "Saved ✓",
            onOk: () => {
              media.forEach((m) => URL.revokeObjectURL(m.url));
              setMedia([]);
              if (!initial) { setContent(""); setPrompt(null); setMood(null); }
              onDone?.();
            },
          },
        );
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
      <MediaBar onAdd={(m) => setMedia((xs) => [...xs, m])} onDictate={(t) => setContent((c) => (c.trim() ? `${c.trimEnd()} ${t}` : t))} />
      <PendingList items={media} onRemove={(k) => setMedia((xs) => xs.filter((x) => x.key !== k))} />
      <div>
        <span className="label">Mood (optional)</span>
        <RatingPicker name="Mood" value={mood} onChange={setMood} labels={MOOD_EMOJI} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || (!content.trim() && !media.length)}>{pending ? "Saving…" : "Save entry"}</button>
        {initial && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-terracotta-soft px-0.5 text-text">{p}</mark> : p));
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
                      <UndoDeleteButton what="Journal entry" action={() => deleteJournal(e.id)} />
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{highlight(e.content, query)}</p>
                  <AttachmentGallery
                    items={e.attachments ?? []}
                    onDelete={(id) => run(async () => { await fetch(`/api/attachments/${id}`, { method: "DELETE" }); return { ok: true }; })}
                  />
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
