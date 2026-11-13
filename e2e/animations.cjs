/* Subtle motion: pages fade in, buttons respond to hover, modals slide in, busy buttons show a spinner, all within 300 ms.
 *   DEMO_PASSWORD=… node e2e/animations.cjs     (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };
const secs = (v) => Math.max(...v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000)));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const p = await ctx.newPage();

  console.log("\nSign-in page");
  await p.goto(BASE + "/login");
  const auth = await p.evaluate(() => { const el = document.querySelector("main > .t-page"); const s = el && getComputedStyle(el); return s && { name: s.animationName, dur: s.animationDuration }; });
  check("fades in on load", auth?.name === "t-page-in" && secs(auth.dur) <= 300, auth ? `${auth.name} ${auth.dur}` : "missing");
  await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");

  console.log("\nApp pages");
  for (const path of ["/", "/log", "/habits", "/me"]) {
    await p.goto(BASE + path);
    const a = await p.evaluate(() => { const el = document.querySelector("#main > .t-page"); const s = el && getComputedStyle(el); return s && { name: s.animationName, dur: s.animationDuration }; });
    check(`${path} fades in`, a?.name === "t-page-in" && secs(a.dur) <= 300, a ? `${a.dur}` : "missing");
  }

  console.log("\nButton hover");
  await p.goto(BASE + "/me");
  const btn = p.locator("main button.btn-primary:not([disabled])").first();
  await btn.scrollIntoViewIfNeeded();
  const t = await btn.evaluate((el) => getComputedStyle(el).transitionDuration);
  check("buttons ease over 150 ms", secs(t) === 150, t);
  const lift = () => btn.evaluate((el) => getComputedStyle(el).translate);
  const before = await lift();
  await btn.hover(); await p.waitForTimeout(260);
  const after = await lift();
  check("a primary button lifts a pixel on hover", before === "none" && after === "0px -1px", `${before} → ${after}`);
  await p.mouse.move(5, 5); await p.waitForTimeout(260);
  check("and settles back when the pointer leaves", (await lift()) === "none");

  console.log("\nModal");
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Quick log" }).click().catch(async () => { await p.setViewportSize({ width: 390, height: 844 }); await p.reload(); await p.getByRole("button", { name: "Quick log" }).click(); });
  const dlg = p.getByRole("dialog", { name: "Quick log" });
  await dlg.waitFor();
  const m = await dlg.evaluate((el) => { const panel = el.querySelector(".t-sheet"); const back = el.querySelector(".t-fade"); const a = getComputedStyle(panel), b = getComputedStyle(back); return { panel: `${a.animationName} ${a.animationDuration}`, back: `${b.animationName} ${b.animationDuration}` }; });
  check("the panel slides in within 300 ms", /^t-(panel|modal)-in/.test(m.panel) && secs(m.panel.split(" ")[1]) <= 300, m.panel);
  check("the backdrop fades in", /^t-fade-in/.test(m.back) && secs(m.back.split(" ")[1]) <= 300, m.back);

  console.log("\nLoading spinner");
  await p.keyboard.press("Escape");
  await p.goto(BASE + "/me");
  const target = p.locator("main button.btn-primary:not([disabled])").first();
  await target.evaluate((el) => el.setAttribute("aria-busy", "true"));
  const sp = await target.evaluate((el) => { const s = getComputedStyle(el, "::before"); return { name: s.animationName, dur: s.animationDuration, iter: s.animationIterationCount, w: s.width, events: getComputedStyle(el).pointerEvents }; });
  check("a busy button shows a spinning ring", sp.name === "t-spin" && sp.iter === "infinite" && parseFloat(sp.w) > 8, `${sp.name} ${sp.dur} ${sp.w}`);
  check("a busy button can't be pressed again", sp.events === "none");

  console.log("\nReduced motion");
  const rctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  await rp.goto(BASE + "/login");
  const r = await rp.evaluate(() => getComputedStyle(document.querySelector("main > .t-page")).animationDuration);
  check("animations are cut to a single frame", secs(r) <= 1, r);

  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll animation checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
