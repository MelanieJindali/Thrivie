import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/Brand";
import { MEDICAL_NOTE } from "@/lib/constants";

export const metadata = { title: "Privacy · Thrivie", description: "How Thrivie protects your health data, in plain language." };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="h2 text-xl">{title}</h2>
    <div className="space-y-2 text-[15px] leading-relaxed">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <Link href="/" className="flex items-center gap-3"><BrandMark /><Wordmark className="text-xl" /></Link>
      <header>
        <p className="eyebrow">Privacy</p>
        <h1 className="h1 mt-2">Your data is yours</h1>
        <p className="mt-3 text-muted">Health information is personal. Here is exactly what Thrivie does with it, in plain language.</p>
      </header>
      <Section title="What we store">
        <p>Only what you enter: your email, a scrambled (hashed) version of your password, your settings, and the entries you log: check-ins, workouts, habits, goals, journal entries, photos and voice notes.</p>
      </Section>
      <Section title="Who can see it">
        <p>Only you. Every record belongs to your account, and the database itself refuses to show it to anyone else, even if there were a bug in the app. Other people using Thrivie can never see your entries.</p>
      </Section>
      <Section title="How it's protected">
        <ul className="list-disc space-y-1 pl-5">
          <li>Journal entries, notes, photos and voice notes are encrypted before they are saved.</li>
          <li>All traffic uses HTTPS. Sign-in cookies can't be read by scripts or sent to other sites.</li>
          <li>Optional two-step verification adds a code from your phone at sign-in.</li>
          <li>We never write your health values, journal text or pasted notes to our logs.</li>
        </ul>
      </Section>
      <Section title="Smart Import stays on your device">
        <p>When you paste notes, they are read on your device. The pasted text is never sent to our server; only the entries you approve are saved. The optional on-device AI also runs entirely on your device. Turning it on downloads a model file once from Hugging Face. No personal information is sent with that download.</p>
      </Section>
      <Section title="Other services we use">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Password safety check</b>: when you choose a password we check it against known breaches using only the first 5 characters of its hash, never the password itself (Have I Been Pwned).</li>
          <li><b>Email</b>: sign-in links are sent by our email provider, if this server has them turned on.</li>
          <li><b>Reminders</b>: if you turn them on, your browser&apos;s push service (Apple, Google or Mozilla) delivers a short message.</li>
        </ul>
        <p>No ads, no analytics, no tracking, and we never sell or share your data.</p>
      </Section>
      <Section title="Your controls">
        <p>In <b>Me</b> you can export everything (JSON or CSV), delete all entries, or permanently delete your account and every record in it.</p>
      </Section>
      <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">{MEDICAL_NOTE}</p>
    </main>
  );
}
