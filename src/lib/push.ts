import "server-only";
import * as webpush from "web-push";
import { prisma, scopedDb } from "./db";
import { todayInTz } from "./dates";
import { getHabitViews } from "./queries";

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup() {
  if (ready || !pushConfigured()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Send to every device the user subscribed. Expired subscriptions are removed. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  setup();
  if (!ready) return 0;
  const db = scopedDb(userId);
  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.error("push failed", code ?? "", (e as Error).message);
      }
    }),
  );
  return sent;
}

/** A friendly, specific nudge based on what's still open today. */
export async function reminderFor(userId: string, timezone: string, name: string): Promise<PushPayload | null> {
  const db = scopedDb(userId);
  const today = todayInTz(timezone);
  const [habits, logged] = await Promise.all([getHabitViews(db, today), db.healthLog.count({ where: { date: today } })]);
  const open = habits.filter((h) => h.dueToday && !h.checkedToday);
  if (!open.length && logged) return null; // nothing to nudge about
  const atRisk = open.find((h) => h.atRisk && h.streak >= 2);
  const hi = name ? `${name}, ` : "";
  let body: string;
  if (atRisk) body = `${hi}your ${atRisk.name.toLowerCase()} streak (${atRisk.streak}) is waiting for today's check-in.`;
  else if (open.length) body = `${hi}${open.length} habit${open.length === 1 ? "" : "s"} left today: ${open.slice(0, 3).map((h) => h.name).join(", ")}.`;
  else body = `${hi}a quick check-in? Log your mood and sleep in a few taps.`;
  return { title: "Thrivie 🌿", body, url: "/" };
}

/** Called by the scheduler (hourly). Sends at most one reminder per user per day. */
export async function runReminders(now = new Date()) {
  const due = await prisma.settings.findMany({ where: { remindersOn: true }, select: { userId: true, timezone: true, reminderHour: true, lastReminded: true, name: true } });
  let sent = 0;
  for (const s of due) {
    const today = todayInTz(s.timezone, now);
    let hour = 0;
    try {
      hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: s.timezone }).format(now));
    } catch {}
    if (hour < s.reminderHour || s.lastReminded === today) continue;
    const msg = await reminderFor(s.userId, s.timezone, s.name);
    if (msg) sent += await sendToUser(s.userId, msg);
    await prisma.settings.update({ where: { userId: s.userId }, data: { lastReminded: today } });
  }
  return { checked: due.length, sent };
}
