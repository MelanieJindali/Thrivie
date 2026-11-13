/* Smart Import still reads notes when the background worker is missing, broken or silent.
 *   DEMO_PASSWORD=… node e2e/importfallback.cjs        (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = process.env.DEMO_EMAIL || "demo@thrivie.app";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };

const SCENARIOS = {
  "worker works": null,
  "worker constructor throws": `window.Worker = class { constructor() { throw new Error("no workers here"); } };`,
  "worker fails to load": `window.Worker = class { constructor() { setTimeout(() => this.onerror && this.onerror(new Event("error")), 50); } postMessage() {} terminate() {} };`,
  "worker never answers": `window.Worker = class { constructor() {} postMessage() {} terminate() {} };`,
  "worker rejects the message": `window.Worker = class { constructor() {} postMessage() { throw new DOMException("could not be cloned", "DataCloneError"); } terminate() {} };`,
};

(async () => {
  const browser = await chromium.launch();
  for (const [name, script] of Object.entries(SCENARIOS)) {
    console.log(`\n${name}`);
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 1400 } });
    if (script) await ctx.addInitScript(script);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/login");
    await p.fill('input[name="email"]', DEMO); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
    await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");
    await p.goto(BASE + "/import");
    await p.getByRole("button", { name: "Try the example" }).click();
    const t0 = Date.now();
    const found = await p.getByText(/Found \d+ entr/).waitFor({ timeout: 12000 }).then(() => true, () => false);
    check("entries appear", found, `${Date.now() - t0}ms`);
    check("no page errors", errs.length === 0, errs[0] || "");
    if (found) {
      await p.getByRole("textbox", { name: "Notes to import" }).fill("Mon - slept 7h, ran 3 miles in 30 min");
      check("editing the note updates the result", await p.getByText(/Found \d+ entr/).waitFor({ timeout: 8000 }).then(() => true, () => false));
    }
    await ctx.close();
  }
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll import fallback checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
