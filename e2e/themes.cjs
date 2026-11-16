/* Colour themes in a real browser (Chromium, phone profile).
 *   DEMO_PASSWORD=… node e2e/themes.cjs
 * Needs the app running on BASE_URL and the seeded demo account. Picks every theme in Settings,
 * checks it applies across pages in light and dark, survives a reload, and passes axe contrast.
 * Set SHOTS=dir to save a screenshot of Today and Insights per theme.
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = process.env.DEMO_EMAIL || "demo@thrivie.app";
const THEMES = [["Thrivie", null], ["Golden Hour", "golden"], ["Lavender Dusk", "lavender"], ["Ember", "ember"], ["Pastel Shore", "pastel"], ["Desert Clay", "clay"], ["Coral Reef", "reef"]];
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], defaultBrowserType: undefined });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', DEMO);
  await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  const vars = () => p.evaluate(() => { const s = getComputedStyle(document.documentElement); return ["--bg", "--primary", "--ring-1", "--sapphire", "--series-1"].map((v) => s.getPropertyValue(v).trim()).join(" "); });
  const seen = new Set();

  for (const [name, id] of THEMES) {
    console.log(`\n${name}`);
    await p.goto(BASE + "/me");
    await p.getByRole("radio", { name: new RegExp("^" + name) }).click();
    check("picker marks it as chosen", (await p.getByRole("radio", { name: new RegExp("^" + name) }).getAttribute("aria-checked")) === "true");
    check("applies to the page", (await p.evaluate(() => document.documentElement.getAttribute("data-palette"))) === id);
    for (const mode of ["Light", "Dark"]) {
      await p.goto(BASE + "/me");
      await p.getByRole("button", { name: new RegExp("^" + mode + "$", "i") }).click();
      const v = await vars();
      check(`${mode.toLowerCase()}: has its own colours`, !seen.has(v) && !v.split(" ").includes(""), v);
      seen.add(v);
      for (const path of ["/", "/log", "/insights", "/me"]) {
        await p.goto(BASE + path);
        await p.waitForLoadState("networkidle");
        check(`${mode.toLowerCase()} ${path}: kept after navigation`, (await vars()) === v);
        const axe = await new AxeBuilder({ page: p }).withRules(["color-contrast"]).analyze();
        check(`${mode.toLowerCase()} ${path}: text contrast`, axe.violations.length === 0, axe.violations.flatMap((x) => x.nodes).slice(0, 3).map((n) => n.html.slice(0, 70)).join(" | "));
        const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        check(`${mode.toLowerCase()} ${path}: no sideways scroll`, !wide);
        if (process.env.SHOTS && path !== "/me") await p.screenshot({ path: `${process.env.SHOTS}/${id || "thrivie"}-${mode.toLowerCase()}${path === "/" ? "-today" : path.replace("/", "-")}.png`, fullPage: true });
      }
    }
  }

  console.log("\nDefault");
  await p.goto(BASE + "/me");
  await p.getByRole("radio", { name: /^Thrivie/ }).click();
  await p.getByRole("button", { name: "Match device" }).click();
  check("choosing Thrivie clears the saved theme", (await p.evaluate(() => localStorage.getItem("thrivie-palette"))) === null);
  await p.evaluate(() => localStorage.setItem("thrivie-palette", "x\"><script>"));
  await p.reload();
  check("an unknown saved value is ignored", (await p.evaluate(() => document.documentElement.getAttribute("data-palette"))) === null);
  await p.evaluate(() => localStorage.removeItem("thrivie-palette"));

  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} theme check(s) failed.`); process.exit(1); }
  console.log("\nAll theme checks passed.");
})().catch((e) => { console.error(e.message); process.exit(1); });
