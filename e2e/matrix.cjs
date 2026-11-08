/* Responsive + accessibility matrix.
 * 7 viewports × light/dark × key screens. For each: no horizontal scrolling,
 * no serious/critical axe violations. Plus a 200% text-size check.
 *   BASE_URL=http://localhost:3000 node e2e/matrix.cjs
 * Requires the demo account (npm run db:seed).
 */
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("node:fs");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.SHOTS_DIR || "";
const VIEWPORTS = [[320, 568], [375, 812], [414, 896], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const PAGES = ["/login", "/", "/log", "/import", "/insights", "/me"];

let storageState = null;
async function signIn(ctx) {
  if (storageState) { await ctx.addCookies(storageState.cookies); return; }
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.locator("input[name=email]").fill("demo@thrivie.app");
  await p.locator("input[name=password]").fill(process.env.DEMO_PASSWORD || "thrivie-demo-2026");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(BASE + "/");
  storageState = await ctx.storageState();
  await p.close();
}

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  let checks = 0;
  for (const theme of ["light", "dark"]) {
    for (const [w, h] of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce" });
      await ctx.addInitScript((t) => { try { localStorage.setItem("thrivie-theme", t); } catch {} }, theme);
      for (const path of PAGES) {
        if (path === "/login") {
          const p = await ctx.newPage();
          await run(p, path, w, h, theme);
          await p.close();
          continue;
        }
      }
      await signIn(ctx);
      const p = await ctx.newPage();
      for (const path of PAGES.filter((x) => x !== "/login")) await run(p, path, w, h, theme);
      await ctx.close();
    }
  }

  async function run(p, path, w, h, theme) {
    checks++;
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(250);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) failures.push(`${theme} ${w}x${h} ${path}: horizontal overflow ${overflow}px`);
    const axe = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
      failures.push(`${theme} ${w}x${h} ${path}: [${v.impact}] ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target?.join(" ")}`);
    }
    if (OUT && (w === 375 || w === 1440) && ["/", "/insights", "/import", "/log"].includes(path)) {
      fs.mkdirSync(OUT, { recursive: true });
      await p.screenshot({ path: `${OUT}/${path === "/" ? "today" : path.slice(1)}-${w === 375 ? "mobile" : "desktop"}-${theme}.png` });
    }
  }

  // 200% text size (user font scaling) on a phone width
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await signIn(ctx);
  const p = await ctx.newPage();
  for (const path of ["/", "/log", "/import", "/insights", "/me"]) {
    checks++;
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: "html{font-size:200% !important}" });
    await p.waitForTimeout(150);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) failures.push(`200% text 375w ${path}: horizontal overflow ${overflow}px`);
  }
  await browser.close();
  const unique = [...new Set(failures.map((f) => f.replace(/^(light|dark) \d+x\d+ /, "")))];
  console.log(`checks: ${checks}, failures: ${failures.length}`);
  for (const f of failures.slice(0, 40)) console.log("  ✗", f);
  if (unique.length) console.log(`distinct issues: ${unique.length}`);
  process.exit(failures.length ? 1 : 0);
})();
