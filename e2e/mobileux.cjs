/* Phone usability on the main pages: no zoom-on-focus, tap-sized targets, no sideways scroll, instant taps.
 *   DEMO_PASSWORD=… node e2e/mobileux.cjs     (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };
const PAGES = ["/", "/log", "/health", "/workouts", "/nutrition", "/habits", "/goals", "/journal", "/import", "/me", "/me/body", "/insights", "/review"];

(async () => {
  const browser = await chromium.launch();
  for (const [name, profile] of [["iPhone 13", devices["iPhone 13"]], ["Pixel 7", devices["Pixel 7"]], ["small phone", { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    console.log(`\n${name}`);
    const ctx = await browser.newContext({ ...profile, defaultBrowserType: undefined });
    const p = await ctx.newPage();
    await p.goto(BASE + "/login");
    await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
    await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");
    const small = [], tiny = [], wide = [];
    for (const path of PAGES) {
      await p.goto(BASE + path); await p.waitForTimeout(450);
      const r = await p.evaluate(() => {
        const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !e.closest("[aria-hidden=true]"); };
        const fields = [...document.querySelectorAll("input, select, textarea")].filter((e) => vis(e) && !["hidden", "checkbox", "radio", "file", "range"].includes(e.type)).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => (e.getAttribute("aria-label") || e.name || e.type || e.tagName).slice(0, 20));
        const targets = [...document.querySelectorAll("main a[href], main button, nav a, nav button")].filter(vis).filter((e) => !e.closest("[data-allow-small]")).map((e) => { const b = e.getBoundingClientRect(); return { n: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 22), w: Math.round(b.width), h: Math.round(b.height) }; }).filter((t) => Math.min(t.w, t.h) < 40);
        return { fields, targets, over: document.documentElement.scrollWidth - innerWidth, tap: getComputedStyle(document.querySelector("main button, main a") || document.body).touchAction };
      });
      small.push(...r.fields.map((f) => `${path} ${f}`));
      tiny.push(...r.targets.map((t) => `${path} "${t.n}" ${t.w}×${t.h}`));
      if (r.over > 0) wide.push(`${path} +${r.over}px`);
      if (r.tap !== "manipulation") tiny.push(`${path} touch-action ${r.tap}`);
    }
    check("every form field is 16px or larger, so iOS doesn't zoom on focus", small.length === 0, small.slice(0, 3).join("; "));
    check("every button and link is at least 40px on its short side", tiny.length === 0, tiny.slice(0, 4).join("; "));
    check("no page scrolls sideways", wide.length === 0, wide.join("; "));
    await ctx.close();
  }
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll phone usability checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
