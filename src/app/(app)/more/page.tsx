import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { MODULE_INFO } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/authActions";

export default async function MorePage() {
  const { visibleModules } = await getSettings();
  const { user } = await requireUser();
  const links = [
    ...visibleModules.map((m) => ({ href: MODULE_INFO[m].href, label: MODULE_INFO[m].label })),
    { href: "/review", label: "📅 Weekly review" },
    { href: "/import", label: "✨ AI Notes Import" },
    { href: "/settings", label: "Settings" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="h1">More</h1>
      <ul className="card divide-y divide-border p-0">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center justify-between px-5 py-4 text-sm hover:bg-surface-2">
              {l.label} <span className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="card flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-muted">{user.email}</span>
        <form action={signOut}><button className="btn-soft py-2 text-xs">Sign out</button></form>
      </div>
    </div>
  );
}
