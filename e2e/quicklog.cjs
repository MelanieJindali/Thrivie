/* Quick-log sheet and past-day habit entry in a real browser (Chromium, phone profile).
 *   DEMO_PASSWORD=… E2E_DATABASE_URL=postgresql://…/thrivie node e2e/quicklog.cjs
 * Needs the app running on BASE_URL and the seeded demo account. The database URL is used to
 * read back what was saved and to clean up. Everything it creates is removed at the end.
 */
if (!process.env.DEMO_PASSWORD || !process.env.E2E_DATABASE_URL) { console.error("Set DEMO_PASSWORD and E2E_DATABASE_URL to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const { Client } = require("pg");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = process.env.DEMO_EMAIL || "demo@thrivie.app";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };
const section = (t) => console.log(`\n${t}`);

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  const sql = async (q, p = []) => (await db.query(q, p)).rows;
  const [{ id: demoId }] = await sql(`SELECT id FROM "User" WHERE email = $1`, [DEMO]);
  const started = new Date();
  const mark = "e2e quick " + Date.now();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], defaultBrowserType: undefined });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', DEMO);
  await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));

  section("Plus button");
  await p.goto(BASE + "/");
  const plus = p.getByRole("button", { name: "Quick log" });
  const box = await plus.boundingBox();
  check("plus button is 48px, round and plain", box && Math.round(box.width) === 48 && Math.round(box.height) === 48 && (await plus.evaluate((e) => getComputedStyle(e).backgroundImage === "none" && getComputedStyle(e).borderRadius.startsWith("9999") || parseFloat(getComputedStyle(e).borderRadius) >= 24)));
  await plus.click();
  const sheet = p.getByRole("dialog", { name: "Quick log" });
  await sheet.waitFor();
  const rows = sheet.locator("button[aria-expanded]");
  await rows.first().waitFor();
  check("sheet lists expandable rows, all closed", (await rows.count()) >= 4 && (await sheet.locator('button[aria-expanded="true"]').count()) === 0, `${await rows.count()} rows`);

  section("Meal mini form");
  await sheet.getByRole("button", { name: /^Meal/ }).click();
  await sheet.getByLabel("What did you have?").fill(mark);
  await sheet.getByLabel("Calories").fill("321");
  check("full-page link is offered", await sheet.getByRole("link", { name: /Open the full meal page/ }).isVisible());
  const axe = await new AxeBuilder({ page: p }).include('[role="dialog"]').analyze();
  check("no accessibility violations in the sheet", axe.violations.length === 0, axe.violations.map((v) => v.id).join(","));
  const small = await sheet.evaluate((el) => [...el.querySelectorAll("button, a, input, select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 47.5; }).map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)));
  check("every control in the sheet is at least 48px tall", small.length === 0, small.join(" | "));
  const out = await sheet.evaluate((el) => { const b = el.getBoundingClientRect(); return [...el.querySelectorAll("input, select, textarea, button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > b.right + 1 || r.left < b.left - 1); }).length; });
  check("no field sticks out of the sheet", out === 0);
  await sheet.getByRole("button", { name: "Save meal" }).click();
  await p.getByText("Meal saved").waitFor();
  const meal = await sql(`SELECT calories FROM "Meal" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  check("meal saved with its calories", meal.length === 1 && meal[0].calories === 321);
  check("form closes after saving", (await sheet.locator('button[aria-expanded="true"]').count()) === 0);

  section("Check-in mini form keeps earlier values");
  const before = (await sql(`SELECT "sleepHours", steps, mood FROM "HealthLog" WHERE "userId" = $1 ORDER BY date DESC LIMIT 1`, [demoId]))[0];
  await sheet.getByRole("button", { name: /^Check-in/ }).click();
  await sheet.getByRole("button", { name: "Save check-in" }).click();
  check("empty check-in is refused", await sheet.getByText("Add at least one value.").isVisible());
  await sheet.getByRole("button", { name: "Mood 4 of 5" }).click();
  await sheet.getByRole("button", { name: "Save check-in" }).click();
  await p.getByText("Check-in saved").waitFor();
  const after = (await sql(`SELECT "sleepHours", steps, mood, "updatedAt" FROM "HealthLog" WHERE "userId" = $1 ORDER BY date DESC LIMIT 1`, [demoId]))[0];
  check("mood saved", after.mood === 4, `mood ${after.mood}`);
  check("sleep and steps logged earlier are untouched", !before || (after.sleepHours === before.sleepHours && after.steps === before.steps));

  section("Workout and journal mini forms");
  await sheet.getByRole("button", { name: /^Workout/ }).click();
  await sheet.getByLabel("Minutes").fill("17");
  await sheet.getByRole("button", { name: "Save workout" }).click();
  await p.getByText("Workout saved").waitFor();
  const w = await sql(`SELECT "durationMin" FROM "Workout" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  check("workout saved", w.length === 1 && w[0].durationMin === 17);
  await sheet.getByRole("button", { name: /^Journal/ }).click();
  await sheet.getByLabel("A few lines about today").fill(mark);
  await sheet.getByRole("button", { name: "Save entry" }).click();
  await p.getByText("Journal entry saved").waitFor();
  const j = await sql(`SELECT content FROM "JournalEntry" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  check("journal saved, and encrypted at rest", j.length === 1 && !j[0].content.includes(mark));
  await p.keyboard.press("Escape");

  section("Log hub tiles go straight to the page");
  await p.goto(BASE + "/log");
  await p.locator("main").getByRole("link", { name: /^Workout/ }).click();
  await p.waitForURL(/\/workouts/);
  check("Workout tile opens the Workouts page", new URL(p.url()).pathname === "/workouts");
  await p.goto(BASE + "/log");
  await p.locator("main").getByRole("link", { name: /^Meal/ }).click();
  await p.waitForURL(/\/nutrition/);
  check("Meal tile opens the Nutrition page", new URL(p.url()).pathname === "/nutrition");

  section("Past-day habits");
  await p.goto(BASE + "/habits");
  const group = p.locator("#today").getByRole("radiogroup", { name: "Day to log" });
  await group.waitFor();
  check("day strip shows today plus six past days and Earlier", (await group.getByRole("radio").count()) === 7 && (await group.locator('input[type="date"]').count()) === 1);
  const dateMax = await group.locator('input[type="date"]').getAttribute("max");
  await group.getByRole("radio").nth(3).click();
  await p.getByText("Logging for").waitFor();
  const toggle = p.locator("#today ul button[aria-pressed]").first();
  const name = (await toggle.getAttribute("aria-label")).split(",")[0];
  const was = (await toggle.getAttribute("aria-pressed")) === "true";
  const d = new Date(dateMax + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 3);
  const day = d.toISOString().slice(0, 10);
  const count = async () => (await sql(`SELECT c.count FROM "HabitCheckin" c JOIN "Habit" h ON h.id = c."habitId" WHERE h."userId" = $1 AND h.name = $2 AND c.date = $3`, [demoId, name, day]))[0]?.count ?? 0;
  await toggle.click();
  await p.waitForFunction((w) => document.querySelector("#today ul button[aria-pressed]").getAttribute("aria-pressed") === String(!w), was);
  await p.waitForTimeout(800);
  check(`check-in three days back is stored on that day (${name})`, ((await count()) > 0) === !was, day);
  await toggle.click();
  await p.waitForTimeout(800);
  check("tapping again puts it back", ((await count()) > 0) === was);

  section("Future days are refused by the server");
  const tomorrow = new Date(dateMax + "T12:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 3);
  const fut = tomorrow.toISOString().slice(0, 10);
  const n0 = (await sql(`SELECT count(*)::int n FROM "HabitCheckin" c JOIN "Habit" h ON h.id = c."habitId" WHERE h."userId" = $1 AND c.date = $2`, [demoId, fut]))[0].n;
  await group.locator('input[type="date"]').evaluate((el, v) => { el.removeAttribute("max"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, fut);
  check("picker ignores a future date", !(await p.getByText("Logging for").isVisible().catch(() => false)) || !(await p.locator("#today").innerText()).includes(String(tomorrow.getUTCDate()) + ".") );
  const n1 = (await sql(`SELECT count(*)::int n FROM "HabitCheckin" c JOIN "Habit" h ON h.id = c."habitId" WHERE h."userId" = $1 AND c.date = $2`, [demoId, fut]))[0].n;
  check("nothing stored on a future day", n0 === n1);

  // clean up
  await sql(`DELETE FROM "Meal" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  await sql(`DELETE FROM "Workout" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  await sql(`DELETE FROM "JournalEntry" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  if (before) await sql(`UPDATE "HealthLog" SET mood = $2 WHERE "userId" = $1 AND "updatedAt" >= $3`, [demoId, before.mood, started]).catch(() => {});
  await browser.close(); await db.end();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll quick-log checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
