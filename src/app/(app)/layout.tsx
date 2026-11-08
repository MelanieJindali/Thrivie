import { Nav } from "@/components/Nav";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { MEDICAL_NOTE } from "@/lib/constants";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const settings = await getSettings();
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      <Nav visible={settings.visibleModules} email={user.email} />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-32 sm:px-6 md:pt-8 md:pb-12">
        {children}
        <p className="mt-10 text-center text-xs text-muted">{MEDICAL_NOTE}</p>
      </main>
    </div>
  );
}
