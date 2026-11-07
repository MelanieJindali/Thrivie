import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getSettings } from "@/lib/settings";
import { MEDICAL_NOTE } from "@/lib/constants";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Thrivie",
  description: "A calm, private wellness tracker for health, workouts, habits, goals and journaling.",
  applicationName: "Thrivie",
  appleWebApp: { capable: true, title: "Thrivie", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#161816" },
  ],
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('thrivie-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <div className="mx-auto flex min-h-dvh max-w-6xl">
          <Nav visible={settings.visibleModules} />
          <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:pt-8 md:pb-12">
            {children}
            <p className="mt-10 text-center text-xs text-muted">{MEDICAL_NOTE}</p>
          </main>
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}
