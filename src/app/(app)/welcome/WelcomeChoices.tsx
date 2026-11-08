"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Sprout, FlaskConical } from "lucide-react";
import { loadSampleDataAction } from "@/app/actions";
import { FormStatus, useAction } from "@/components/ui";

export function WelcomeChoices() {
  const router = useRouter();
  const { run, pending, error, message } = useAction();
  const tile = "lift card flex flex-col items-start gap-3 text-left";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/habits#manage" className={tile}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-emerald to-teal text-white shadow-md"><Sprout size={20} /></span>
          <span className="font-display text-lg font-semibold">Start fresh</span>
          <span className="text-sm text-muted">Add a few habits you care about, then log as you go.</span>
        </Link>
        <Link href="/import" className={tile}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-primary to-plum text-white shadow-md"><Sparkles size={20} /></span>
          <span className="font-display text-lg font-semibold">Import your notes</span>
          <span className="text-sm text-muted">Paste notes from any app and let AI turn them into entries.</span>
        </Link>
        <button
          className={tile}
          disabled={pending}
          onClick={() => run(() => loadSampleDataAction(), { onOk: () => router.push("/") })}
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-amber to-rose text-white shadow-md"><FlaskConical size={20} /></span>
          <span className="font-display text-lg font-semibold">{pending ? "Loading…" : "Explore with sample data"}</span>
          <span className="text-sm text-muted">See a month of example data. Clear it any time in Settings.</span>
        </button>
      </div>
      <FormStatus error={error} message={message} />
      <p className="text-center text-sm"><Link href="/" className="font-semibold text-primary">Skip to dashboard ›</Link></p>
    </div>
  );
}
