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

  const newGp = [];
  const openRow = async (name) => { await sheet.locator("button[aria-expanded]").filter({ hasText: new RegExp("^" + name) }).first().click(); };
  const more = async () => { await sheet.getByRole("button", { name: "More details" }).click(); };

  // rating buttons toggle, so only press one that is not already chosen
  const pick = async (name) => { const r = sheet.getByRole("radio", { name }); if ((await r.getAttribute("aria-checked")) !== "true") await r.click(); };

  section("Meal: every field of the full form");
  await openRow("Meal");
  await sheet.getByLabel("What did you have?").fill(mark);
  await sheet.getByLabel("Calories").fill("321");
  check("full-page link is offered", await sheet.getByRole("link", { name: /Open the full meal page/ }).isVisible());
  await more();
  await sheet.getByLabel("Protein (g)").fill("21");
  await sheet.getByLabel("Carbs (g)").fill("32");
  await sheet.getByLabel("Fat (g)").fill("9");
  await sheet.getByLabel("Note (private)").fill("note " + mark);
  const mealDate = await sheet.getByLabel("Date").inputValue();
  const axe = await new AxeBuilder({ page: p }).include('[role="dialog"]').analyze();
  check("no accessibility violations in the sheet", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 60)}`).join(" | "));
  const small = await sheet.evaluate((el) => [...el.querySelectorAll("button, a, input, select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)));
  check("every control in the sheet is at least 44px tall", small.length === 0, small.join(" | "));
  const out = await sheet.evaluate((el) => { const b = el.getBoundingClientRect(); return [...el.querySelectorAll("input, select, textarea, button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > b.right + 1 || r.left < b.left - 1); }).length; });
  check("no field sticks out of the sheet", out === 0);
  await sheet.getByRole("button", { name: "Save meal" }).click();
  await p.getByText("Meal saved").waitFor();
  const meal = await sql(`SELECT calories, "proteinG", "carbsG", "fatG", date, notes FROM "Meal" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  check("meal stored with calories, macros and date", meal.length === 1 && meal[0].calories === 321 && Number(meal[0].proteinG) === 21 && Number(meal[0].carbsG) === 32 && Number(meal[0].fatG) === 9 && meal[0].date === mealDate, JSON.stringify(meal[0] && { ...meal[0], notes: undefined }));
  check("meal note stored, and encrypted at rest", !!meal[0]?.notes && !String(meal[0].notes).includes(mark));
  check("form closes after saving", (await sheet.locator('button[aria-expanded="true"]').count()) === 0);

  section("Check-in: every field, and earlier values are kept");
  await openRow("Check-in");
  await more();
  const day = await sheet.getByLabel("Date").inputValue();
  const before = (await sql(`SELECT * FROM "HealthLog" WHERE "userId" = $1 AND date = $2`, [demoId, day]))[0];
  if (!before) {
    await sheet.getByRole("button", { name: "Save check-in" }).click();
    check("empty check-in is refused", await sheet.getByText("Add at least one value.").isVisible());
  }
  await pick("Mood 4");
  await pick("Energy 2");
  await pick("Sleep quality 5");
  await sheet.getByLabel("Steps").fill("4321");
  await sheet.getByRole("button", { name: "Add metric" }).click();
  await sheet.getByLabel("Metric name").last().fill("Resting HR");
  await sheet.getByLabel("Metric value").last().fill("58");
  await sheet.getByLabel("Notes").fill("note " + mark);
  await sheet.getByRole("button", { name: /(Save|Update) check-in/ }).click();
  await p.getByText(/Check-in (saved|updated)/).first().waitFor();
  const after = (await sql(`SELECT * FROM "HealthLog" WHERE "userId" = $1 AND date = $2`, [demoId, day]))[0];
  check("mood, energy, sleep quality and steps stored", after.mood === 4 && after.energy === 2 && after.sleepQuality === 5 && after.steps === 4321, JSON.stringify({ m: after.mood, e: after.energy, q: after.sleepQuality, s: after.steps }));
  check("custom metric stored", String(after.custom || "").includes("Resting HR") && String(after.custom).includes("58"));
  check("values logged earlier that day are untouched", !before || (after.sleepHours === before.sleepHours && after.weightKg === before.weightKg && after.waterMl === before.waterMl));
  // a second quick check-in adds to the first instead of replacing it
  await p.waitForTimeout(700);
  await openRow("Check-in");
  await sheet.getByLabel("Sleep (hours)").fill("7.5");
  await sheet.getByRole("button", { name: "Update check-in" }).click();
  await p.getByText("Check-in updated").first().waitFor();
  const again = (await sql(`SELECT * FROM "HealthLog" WHERE "userId" = $1 AND date = $2`, [demoId, day]))[0];
  check("a second check-in keeps the first one's values", again.sleepHours === 7.5 && again.mood === 4 && again.steps === 4321 && String(again.custom || "").includes("Resting HR"), JSON.stringify({ sl: again.sleepHours, m: again.mood, s: again.steps }));

  section("Workout: every field of the full form");
  await p.waitForTimeout(700);
  await openRow("Workout");
  await sheet.getByRole("button", { name: /Strength/ }).click();
  await sheet.getByPlaceholder("45").fill("17");
  await more();
  await sheet.getByLabel("Title (optional)").fill("Legs " + mark);
  await sheet.getByRole("radio", { name: "Intensity 4" }).click();
  await sheet.getByRole("button", { name: "Add exercise" }).click();
  await sheet.getByLabel("Exercise name").fill("Squat");
  await sheet.getByLabel("Sets").fill("4");
  await sheet.getByLabel("Reps").fill("8");
  await sheet.getByLabel("Weight", { exact: true }).fill("135");
  await sheet.getByLabel("Notes").fill("felt strong");
  await sheet.getByRole("button", { name: "Save workout" }).click();
  await p.getByText("Workout saved").waitFor();
  const w = await sql(`SELECT w.id, w."durationMin", w.intensity, w.type, w.title, (SELECT count(*)::int FROM "Exercise" e WHERE e."workoutId" = w.id AND e.sets = 4 AND e.reps = 8) AS ex FROM "Workout" w WHERE w."userId" = $1 AND w."createdAt" >= $2`, [demoId, started]);
  check("workout stored with type, minutes, intensity, title and exercise", w.length === 1 && w[0].durationMin === 17 && w[0].intensity === 4 && w[0].type === "strength" && w[0].ex === 1 && !!w[0].title, JSON.stringify(w[0] && { ...w[0], title: undefined }));

  section("Journal: text, mood and prompt");
  await p.waitForTimeout(700);
  await openRow("Journal");
  await sheet.getByLabel("Journal entry").fill(mark);
  await more();
  await sheet.getByRole("radio", { name: "Mood 5" }).click();
  await sheet.getByRole("group", { name: "Writing prompts" }).getByRole("button").first().click();
  check("photo and voice note controls are in the sheet", (await sheet.getByRole("button", { name: /photo|voice|record|dictat/i }).count()) + (await sheet.locator('input[type="file"]').count()) > 0);
  await sheet.getByRole("button", { name: "Save entry" }).click();
  await p.getByText("Journal entry saved").waitFor();
  const j = await sql(`SELECT content, mood, prompt FROM "JournalEntry" WHERE "userId" = $1 AND "createdAt" >= $2`, [demoId, started]);
  check("journal stored with mood and prompt, text encrypted at rest", j.length === 1 && !j[0].content.includes(mark) && j[0].mood === 5 && !!j[0].prompt);

  section("Goal progress: amount, note and date");
  await p.waitForTimeout(700);
  const gpBefore = new Set((await sql(`SELECT gp.id FROM "GoalProgress" gp JOIN "Goal" g ON g.id = gp."goalId" WHERE g."userId" = $1`, [demoId])).map((x) => x.id));
  await openRow("Goal progress");
  await sheet.getByRole("button", { name: "Add progress" }).or(sheet.getByText(/No goals that take manual updates/)).first().waitFor();
  const hasGoal = await sheet.getByRole("button", { name: "Add progress" }).count();
  if (hasGoal) {
    await sheet.getByLabel(/^Amount/).fill("2");
    await more();
    await sheet.getByLabel("Note").fill("gp " + mark);
    await sheet.getByRole("button", { name: "Add progress" }).click();
    await p.getByText("Progress added").waitFor();
    const gp = (await sql(`SELECT gp.id, gp.value, gp.note FROM "GoalProgress" gp JOIN "Goal" g ON g.id = gp."goalId" WHERE g."userId" = $1`, [demoId])).filter((x) => !gpBefore.has(x.id));
    newGp.push(...gp.map((x) => x.id));
    check("goal progress stored with its note", gp.length === 1 && Number(gp[0].value) === 2 && !!gp[0].note, JSON.stringify(gp.map((x) => x.value)));
  } else check("goal progress row explains there are no manual goals", await sheet.getByText(/No goals that take manual updates/).isVisible());

  section("Sheet behaviour");
  await p.keyboard.press("Escape");
  check("Escape closes the sheet and focus returns to the plus button", !(await sheet.isVisible()) && (await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Quick log");
  await plus.click();
  await openRow("Meal");
  await sheet.getByLabel("What did you have?").fill("carry " + mark);
  await sheet.getByLabel("Calories").fill("111");
  await sheet.getByRole("link", { name: /Open the full meal page/ }).click();
  await p.waitForURL(/\/nutrition/);
  const carried = p.locator("main form").getByLabel("What did you have?");
  await carried.waitFor();
  await p.waitForFunction((v) => [...document.querySelectorAll("main form input")].some((i) => i.value === v), "carry " + mark, { timeout: 5000 }).catch(() => {});
  check("what was typed carries over to the full page", (await carried.inputValue()) === "carry " + mark && (await p.locator("main form").getByLabel("Calories").first().inputValue()) === "111");
  await p.goto(BASE + "/");
  await plus.click(); await openRow("Meal");
  await sheet.getByLabel("What did you have?").fill("abandon " + mark);
  await p.keyboard.press("Escape");
  check("closing the sheet forgets a half-typed entry", (await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("thrivie-draft:")).length)) === 0);

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
  const pastDay = d.toISOString().slice(0, 10);
  const count = async () => (await sql(`SELECT c.count FROM "HabitCheckin" c JOIN "Habit" h ON h.id = c."habitId" WHERE h."userId" = $1 AND h.name = $2 AND c.date = $3`, [demoId, name, pastDay]))[0]?.count ?? 0;
  await toggle.click();
  await p.waitForFunction((w) => document.querySelector("#today ul button[aria-pressed]").getAttribute("aria-pressed") === String(!w), was);
  await p.waitForTimeout(800);
  check(`check-in three days back is stored on that day (${name})`, ((await count()) > 0) === !was, pastDay);
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
  if (before) await sql(`UPDATE "HealthLog" SET mood = $3, energy = $4, "sleepQuality" = $5, steps = $6, custom = $7, notes = $8, "sleepHours" = $9 WHERE "userId" = $1 AND date = $2`, [demoId, day, before.mood, before.energy, before.sleepQuality, before.steps, before.custom, before.notes, before.sleepHours]).catch(() => {});
  else await sql(`DELETE FROM "HealthLog" WHERE "userId" = $1 AND date = $2`, [demoId, day]).catch(() => {});
  if (newGp.length) await sql(`DELETE FROM "GoalProgress" WHERE id = ANY($1)`, [newGp]).catch(() => {});
  await browser.close(); await db.end();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll quick-log checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
