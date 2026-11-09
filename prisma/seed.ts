/* Creates (or resets) two demo accounts with ~30 days of sample data each.
 *   npm run db:seed
 * Logins: demo@thrivie.app and demo2@thrivie.app, password from DEMO_PASSWORD
 * (set it in your git-ignored .env; there is no built-in default).
 * Only these two demo accounts are touched; other users are never modified.
 */
import "dotenv/config";
import { disconnect, scopedDb, systemDb } from "../src/lib/db";
import { loadSampleData } from "../src/lib/sampleData";
import { hashPassword } from "../src/lib/password";

const USERS = [
  { email: "demo@thrivie.app", name: "Alex", variant: 0 },
  { email: "demo2@thrivie.app", name: "Sam", variant: 1 },
];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "yes") {
    throw new Error("Refusing to create demo accounts in production (set ALLOW_DEMO_SEED=yes to override).");
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set DEMO_PASSWORD (12+ characters) in your .env before seeding.");
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezone = process.env.SEED_TZ || (detected && detected !== "UTC" ? detected : "America/New_York");
  const sys = systemDb();
  for (const u of USERS) {
    await sys.user.deleteMany({ where: { email: u.email } }); // cascades to that demo user's data only
    const user = await sys.user.create({
      data: { email: u.email, passwordHash: await hashPassword(password), settings: { create: { name: u.name, units: "imperial", timezone, onboarded: true } } },
    });
    await loadSampleData(scopedDb(user.id), user.id, timezone, 30, u.variant);
    console.log(`Seeded ${u.email} (30 days, ${timezone}).`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Seed failed");
    process.exit(1);
  })
  .finally(() => disconnect());
