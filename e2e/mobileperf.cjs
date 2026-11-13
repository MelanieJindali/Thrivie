/* Phone smoothness: first paint, layout shift, scroll frames and animation frames on an iPhone profile with a 4x slower CPU.
 *   DEMO_PASSWORD=… node e2e/mobileperf.cjs [--assert]     (app running on BASE_URL, seeded demo account)
 * Prints the numbers; with --assert it fails when they pass the budgets below. Numbers vary by machine, so budgets are loose.
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ASSERT = process.argv.includes("--assert");
const BUDGET = { cls: 0.05, scrollP95: 34, scrollOver50: 0.05, sheetWorst: 70, sheetOver34: 0.4 };
const failures = [];
const frameStats = (ts) => { const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b); return { n: d.length, p50: d[Math.floor(d.length * 0.5)] ?? 0, p95: d[Math.floor(d.length * 0.95)] ?? 0, worst: d[d.length - 1] ?? 0, over34: d.filter((x) => x > 34).length / Math.max(1, d.length), over50: d.filter((x) => x > 50).length / Math.max(1, d.length) }; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], defaultBrowserType: undefined });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // 1. Load: paint and layout shift
  await p.addInitScript(() => {
    window.__cls = 0; window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await p.goto(BASE + "/");
  await p.locator("#brief-title").waitFor();
  await p.waitForTimeout(1200);
  const load = await p.evaluate(() => ({ cls: window.__cls, lcp: Math.round(window.__lcp), fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0), transferKb: Math.round(performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), 0) / 1024) }));
  console.log(`load      fcp ${load.fcp}ms  lcp ${load.lcp}ms  layout shift ${load.cls.toFixed(3)}  transferred ${load.transferKb} kB`);

  // 2. Scroll the whole page in finger-sized swipes, timing every frame
  const scroll = await p.evaluate(async () => {
    const ts = []; let on = true;
    const tick = (t) => { ts.push(t); if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const max = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y < max; y += 40) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
    for (let y = max; y > 0; y -= 80) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
    on = false; return ts;
  });
  const sc = frameStats(scroll);
  console.log(`scroll    ${sc.n} frames  median ${sc.p50.toFixed(1)}ms  p95 ${sc.p95.toFixed(1)}ms  worst ${sc.worst.toFixed(0)}ms  over 50ms ${(sc.over50 * 100).toFixed(1)}%`);

  // 3. Open the quick-log sheet and time the frames while it slides in
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  const sheet = await p.evaluate(async () => {
    const ts = []; let on = true;
    const tick = (t) => { ts.push(t); if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Quick log").click();
    await new Promise((r) => setTimeout(r, 600));
    on = false; return ts;
  });
  const sh = frameStats(sheet);
  console.log(`sheet     ${sh.n} frames  median ${sh.p50.toFixed(1)}ms  worst ${sh.worst.toFixed(0)}ms  slower than 34ms ${(sh.over34 * 100).toFixed(0)}%`);
  await p.keyboard.press("Escape");

  // 4. Tap response: how long from tap to the first change on screen
  const tap = await p.evaluate(async () => {
    const b = [...document.querySelectorAll("nav a")].find((a) => a.getAttribute("href") === "/log") || document.querySelector("nav a");
    const t0 = performance.now(); b.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t0);
  });
  console.log(`tap       next paint after a tap ${tap}ms`);

  if (ASSERT) {
    const chk = (name, ok) => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}`); if (!ok) failures.push(name); };
    chk(`layout shift ≤ ${BUDGET.cls}`, load.cls <= BUDGET.cls);
    chk(`scroll p95 ≤ ${BUDGET.scrollP95}ms`, sc.p95 <= BUDGET.scrollP95);
    chk(`scroll frames over 50ms ≤ ${BUDGET.scrollOver50 * 100}%`, sc.over50 <= BUDGET.scrollOver50);
    chk(`sheet slowest frame ≤ ${BUDGET.sheetWorst}ms`, sh.worst <= BUDGET.sheetWorst);
    chk(`sheet frames slower than 34ms ≤ ${BUDGET.sheetOver34 * 100}%`, sh.over34 <= BUDGET.sheetOver34);
  }
  await browser.close();
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
