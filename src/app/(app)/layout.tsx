import { BackToTop } from "@/components/BackToTop";
import { LegacyAiCleanup } from "@/components/LegacyAiCleanup";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { QuickLogProvider } from "@/components/QuickLog";
import { ToastProvider } from "@/components/Toast";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineSync } from "@/components/OfflineSync";
import { currentSignInMethod, sha256 } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { PasskeyUpgradeBanner } from "@/components/Passkeys";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { MEDICAL_NOTE } from "@/lib/constants";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const settings = await getSettings();
  const path = (await headers()).get("x-pathname") ?? "/";
  if (!settings.onboarded && path !== "/welcome") redirect("/welcome");
  // Offer a passkey once, to people who just signed in with a password and have none yet.
  const offerPasskey = !settings.tipsSeen.includes("passkey") && path !== "/welcome" && (await currentSignInMethod()) === "password"
    && (await systemDb().passkey.count({ where: { userId: user.id } })) === 0;
  return (
    <ToastProvider>
      <OfflineSync owner={sha256(`owner:${user.id}`).slice(0, 16)}>
      <QuickLogProvider>
      <a href="#main" className="sr-only z-50 rounded-full bg-surface px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      <div className="mx-auto flex min-h-dvh max-w-[90rem]">
        <Nav visible={settings.visibleModules} email={user.email} />
        <main id="main" className="min-w-0 flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-36 sm:px-6 md:pt-8 md:pb-12 lg:px-10">
          <OfflineBanner />
          {offerPasskey && <PasskeyUpgradeBanner />}
          {children}
          <p className="mt-12 text-center text-xs text-muted">{MEDICAL_NOTE} <a href="/privacy" className="underline">Privacy</a></p>
        </main>
      </div>
      </QuickLogProvider>
      <BackToTop />
      <LegacyAiCleanup />
      </OfflineSync>
    </ToastProvider>
  );
}
