import { KeyGen } from "./KeyGen";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Setup keys · Thrivie", description: "Generate the secret keys Thrivie needs, privately in your browser." };

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div className="flex items-center"><Logo variant="wordmark" size="sm" /><span className="text-sm font-bold text-muted">Setup</span></div>
      <h1 className="h1">Generate your secret keys</h1>
      <p className="text-muted">These are created by your browser on this device and never sent anywhere. Copy each one into your hosting provider&apos;s environment variables, then close this page.</p>
      <KeyGen />
    </main>
  );
}
