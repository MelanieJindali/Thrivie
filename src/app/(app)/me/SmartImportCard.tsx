"use client";

import { useState } from "react";
import { ListControls, NoMatches, ShowMoreButton, useListView } from "@/components/ListControls";
import { Wand2 } from "lucide-react";
import { deleteAlias, updateAlias } from "@/app/actions";
import { UndoDeleteButton, useToast } from "@/components/Toast";

type Alias = { id: string; kind: string; alias: string; target: string };

export function SmartImportCard({ aliases }: { aliases: Alias[] }) {
  const view = useListView(aliases, {
    searchText: (a) => `${a.alias} ${a.target}`,
    sorts: [{ key: "az", label: "A–Z", compare: (a, b) => a.alias.localeCompare(b.alias) }, { key: "kind", label: "By type", compare: (a, b) => a.kind.localeCompare(b.kind) || a.alias.localeCompare(b.alias) }],
    pageSize: 10,
  });
  const toast = useToast();

  return (
    <section className="card space-y-4" aria-labelledby="si-h">
      <h2 id="si-h" className="h2 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-iris-soft text-iris" aria-hidden><Wand2 size={16} /></span>
        Smart Import
      </h2>
      <div>
        <h3 className="label">Your shorthand</h3>
        {aliases.length ? (
          <>
          {aliases.length > 5 && <ListControls view={view} label="shorthand" searchPlaceholder="Search shorthand" />}
          <NoMatches view={view} />
          <ul className="divide-y divide-border">
            {view.visible.map((a) => <AliasRow key={a.id} a={a} />)}
          </ul>
          <ShowMoreButton view={view} noun="more" />
          </>
        ) : (
          <p className="text-sm text-muted">When you correct an import (for example “bb” → “Bench press”), Thrivie remembers it here for next time.</p>
        )}
      </div>
    </section>
  );
}

function AliasRow({ a }: { a: Alias }) {
  const [target, setTarget] = useState(a.target);
  const toast = useToast();
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs">{a.alias}</span>
      <span aria-hidden>→</span>
      <input className="input max-w-52 py-1.5 text-sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={`Meaning of ${a.alias}`}
        onBlur={async () => { if (target !== a.target) { const r = await updateAlias(a.id, target); toast(r.ok ? { message: "Saved" } : { message: r.error, tone: "error" }); } }} />
      <span className="text-xs text-muted">{a.kind}</span>
      <UndoDeleteButton what="Shorthand" action={() => deleteAlias(a.id)} />
    </li>
  );
}
