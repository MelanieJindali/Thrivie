/* Today page section order: brief, today so far, highlights, goals, quick actions, habit progress, today's habits, meal plan.
 *   DEMO_PASSWORD=… node e2e/todayorder.cjs [screenshot-dir]    (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const shots = process.argv[2];
const ORDER = [["Daily brief", "#brief-title"], ["Today so far", "#sofar-h"], ["Highlights", "#hl-h"], ["Goals", "#goals-h"], ["Quick actions", 'nav[aria-label="Quick log"]'], ["Habit progress", "#today-progress"], ["Today's habits", "#habits-h"], ["Meal plan", "text=Today's meal plan"]];
let failed = 0;
(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [["phone", { ...devices["iPhone 13"], defaultBrowserType: undefined }], ["desktop", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }]]) {
    const p = await (await browser.newContext(opts)).newPage();
    await p.goto(BASE + "/login");
    await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
    await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");
    await p.locator("#brief-title").waitFor();
    const tops = [];
    for (const [name, sel] of ORDER) { const b = await p.locator(sel).first().boundingBox(); tops.push([name, b ? Math.round(b.y + (await p.evaluate(() => scrollY))) : null]); }
    const present = tops.filter(([, y]) => y != null);
    const ok = present.length >= 7 && present.every(([, y], i) => i === 0 || y > present[i - 1][1]);
    console.log(`${ok ? "  ok " : "  FAIL"} ${label}: ${present.map(([n, y]) => `${n} ${y}`).join(" → ")}`);
    if (!ok) failed++;
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(`${over <= 0 ? "  ok " : "  FAIL"} ${label}: no sideways scroll`); if (over > 0) failed++;
    if (shots) { await p.waitForTimeout(600); await p.screenshot({ path: `${shots}/today-${label}.png`, fullPage: true }); }
    await p.context().close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nAll Today order checks passed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
