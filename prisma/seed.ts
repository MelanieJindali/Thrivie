/* Creates (or resets) a demo account with ~30 days of realistic sample data.
 *   npm run db:seed
 * Login: demo@thrivie.app / thrivie-demo   (override with DEMO_EMAIL / DEMO_PASSWORD)
 * Only the demo account is touched — other users' data is never modified.
 */
import "dotenv/config";
import { prisma, scopedDb } from "../src/lib/db";
import { loadSampleData } from "../src/lib/sampleData";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = (process.env.DEMO_EMAIL || "demo@thrivie.app").toLowerCase();
  const password = process.env.DEMO_PASSWORD || "thrivie-demo";
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Servers/containers often run in UTC; default to a U.S. zone in that case.
  const timezone = process.env.SEED_TZ || (detected && detected !== "UTC" ? detected : "America/New_York");

  await prisma.user.deleteMany({ where: { email } }); // cascades to the demo user's data only
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), settings: { create: { name: "Alex", units: "imperial", timezone } } },
  });
  await loadSampleData(scopedDb(user.id), user.id, timezone);
  console.log(`Seeded demo account ${email} (password: ${password}) with 30 days of data (${timezone}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
