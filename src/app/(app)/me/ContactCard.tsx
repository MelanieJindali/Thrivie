"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { FormStatus, useAction } from "@/components/ui";
import { CONTACT_TOPICS, IMPACT, type ContactTopicId } from "@/lib/contact";
import { sendContactMessage } from "@/app/contactActions";

const PLACEHOLDER: Record<ContactTopicId, string> = {
  coaching: "Tell us a little about what you'd like help with and what you're working towards.",
  health: "What would you like to know? You don't need to share more health detail than you're comfortable with.",
  help: "What are you trying to do, and where are you stuck?",
  problem: "What happened, what did you expect, and the steps to see it again if you know them.",
  feedback: "What would make Thrivie better for you?",
};

function deviceDetails() {
  const theme = document.documentElement.getAttribute("data-palette") ?? "thrivie";
  const mode = document.documentElement.classList.contains("dark") ? "dark" : "light";
  return `${navigator.userAgent} · ${screen.width}×${screen.height} · ${theme} ${mode}${navigator.onLine ? "" : " · offline"}`.slice(0, 300);
}

/** Settings card: a short form that emails the Thrivie team, sorted by topic. */
export function ContactCard({ email, enabled }: { email: string; enabled: boolean }) {
  const [topic, setTopic] = useState<ContactTopicId | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [impact, setImpact] = useState<"low" | "medium" | "high" | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [allowReply, setAllowReply] = useState(true);
  const [device, setDevice] = useState(false);
  const [sent, setSent] = useState(false);
  const { pending, error, run, setError } = useAction();
  const t = CONTACT_TOPICS.find((x) => x.id === topic);

  if (!enabled)
    return <p className="text-sm text-muted">Messages to the Thrivie team aren&apos;t available right now. Please check back soon.</p>;

  if (sent)
    return (
      <div className="t-fade space-y-3" role="status">
        <p className="font-semibold">Thanks, your message is on its way.</p>
        <p className="text-sm text-muted">{allowReply ? `We'll reply to ${email}.` : "You chose not to share your email, so we won't be able to reply directly."}</p>
        <button type="button" className="btn-soft" onClick={() => { setSent(false); setTopic(null); setSub(null); setImpact(null); }}>Send another message</button>
      </div>
    );

  const pickTopic = (id: ContactTopicId) => {
    setTopic(id); setSub(null); setError(null);
    setImpact(null); setDevice(id === "problem");
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic || !sub) return setError("Choose a topic first.");
    if (topic === "problem" && !impact) return setError("Choose how much this affects you.");
    run(
      () => sendContactMessage({ topic, sub, subject, message, impact: impact ?? undefined, allowReply, device: device ? deviceDetails() : undefined }),
      { onOk: () => { setSent(true); setSubject(""); setMessage(""); } },
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit} aria-label="Contact the Thrivie team">
      <fieldset>
        <legend className="label">What&apos;s it about?</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Topic">
          {CONTACT_TOPICS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={topic === x.id}
              onClick={() => pickTopic(x.id)}
              className={`min-h-12 rounded-2xl border px-3 py-2 text-left transition-colors ${topic === x.id ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}
            >
              <span className="block text-sm font-semibold">{x.label}</span>
              <span className="block text-xs text-muted">{x.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {t && (
        <div className="t-fade space-y-4">
          <fieldset>
            <legend className="label">Topic</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${t.label} topic`}>
              {t.subs.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={sub === s.id} className={`chip ${sub === s.id ? "chip-on" : ""}`} onClick={() => { setSub(s.id); setError(null); }}>
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          {topic === "problem" && (
            <fieldset>
              <legend className="label">How much does it affect you?</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Impact">
                {IMPACT.map((i) => (
                  <button key={i.id} type="button" role="radio" aria-checked={impact === i.id} className={`chip ${impact === i.id ? "chip-on" : ""}`} onClick={() => setImpact(i.id)}>{i.label}</button>
                ))}
              </div>
            </fieldset>
          )}

          {(topic === "health" || topic === "coaching") && (
            <p className="rounded-2xl bg-gold-soft px-3 py-2 text-sm text-text">
              Thrivie can&apos;t give medical advice or help in an emergency. If you need urgent help, call your local emergency number.
            </p>
          )}

          <label className="block">
            <span className="label">Subject (optional)</span>
            <input id="contact-subject" className="input" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">Message</span>
            <textarea id="contact-message" className="input min-h-32" value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} placeholder={topic ? PLACEHOLDER[topic] : undefined} required />
            <span className="mt-1 block text-right text-xs text-muted" aria-live="polite">{message.length} / 4,000</span>
          </label>

          <div className="space-y-2 text-sm">
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--primary)]" checked={allowReply} onChange={(e) => setAllowReply(e.target.checked)} />
              <span>You can reply to me at <strong className="break-all">{email}</strong></span>
            </label>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--primary)]" checked={device} onChange={(e) => setDevice(e.target.checked)} />
              <span>Include device details (browser, screen size, theme) to help us look into it</span>
            </label>
          </div>

          <p className="text-xs text-muted">Your message is sent by email to the Thrivie team. None of your logged entries are attached; only share what you&apos;re comfortable sending.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={pending} aria-busy={pending}><Send size={18} aria-hidden="true" />{pending ? "Sending…" : "Send message"}</button>
            <FormStatus error={error} message={null} />
          </div>
        </div>
      )}
      {!t && error && <FormStatus error={error} message={null} />}
    </form>
  );
}
