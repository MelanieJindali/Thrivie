import { BrandMark } from "@/components/Brand";

export const metadata = { title: "Offline · Thrivie" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <BrandMark size={52} />
      <h1 className="h1">You&apos;re offline</h1>
      <p className="text-muted">Pages you&apos;ve opened before still work, and anything you log is saved on this device and synced when you&apos;re back online.</p>
    </main>
  );
}
