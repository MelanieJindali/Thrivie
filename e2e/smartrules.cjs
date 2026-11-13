/* Smart Import reads everyday notes instantly with rules (no AI model), and the brief switches to its numbers.
 *   DEMO_PASSWORD=… node e2e/smartrules.cjs      (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], defaultBrowserType: undefined });
  const p = await ctx.newPage();
  const outside = []; const errors = [];
  p.on("request", (r) => { const h = new URL(r.url()).host; if (h !== new URL(BASE).host && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(h); });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");

  console.log("\nSmart Import");
  await p.goto(BASE + "/import");
  const box = p.getByRole("textbox", { name: "Notes to import" });
  for (const [note, expected] of [["Friday stretch 30 mins", /Found [12] entr/], ["Fri - stretch", /Found 1 entr/], ["1/2/26 ate an apple", /Found 1 entr/], ["had coffee and a bagel\nstretch 20 mins\ntook supplements", /Found [23] entr/]]) {
    await box.fill(note);
    const t0 = Date.now();
    const ok = await p.getByText(expected).waitFor({ timeout: 4000 }).then(() => true, () => false);
    check(`reads ${JSON.stringify(note).slice(0, 40)}`, ok && !(await p.getByText("Nothing recognised").count()), `${Date.now() - t0}ms`);
  }
  await box.fill("1/2/26 ate an apple"); await p.getByText(/Found 1 entr/).waitFor();
  check("the estimated meal needs a look before saving", await p.getByText(/needs? a quick look/).isVisible());
  check("no AI controls on the page", (await p.getByText(/on-device AI|Enhance/i).count()) === 0);
  await box.fill("<img src=x onerror=window.__xss=1> ate an apple"); await p.waitForTimeout(800);
  check("markup in a note is shown as text, not run", (await p.evaluate(() => window.__xss)) === undefined);

  console.log("\nDaily brief");
  await p.goto(BASE + "/");
  const card = p.locator("#brief-title").locator("xpath=ancestor::section");
  const summary = await card.locator("p.font-display").first().innerText();
  check("summary is there on load, no spinner", summary.length > 20 && (await card.locator(".animate-pulse").count()) === 0);
  await card.getByRole("button", { name: "Show the numbers" }).click();
  check("numbers view shows figures", (await card.locator("dl dt").count()) >= 1);
  await card.getByRole("button", { name: "Show summary" }).click();
  check("back to the same summary", (await card.locator("p.font-display").first().innerText()) === summary);
  check("no AI controls on Today", (await card.getByText(/on-device AI|Rewrite/i).count()) === 0);

  check("no requests left the site", outside.length === 0, [...new Set(outside)].join(", "));
  check("no page errors", errors.length === 0, errors[0] || "");
  const csp = (await (await p.request.get(BASE + "/login")).headersArray()).find((h) => h.name.toLowerCase() === "content-security-policy")?.value || "";
  check("connect-src is this site only", /connect-src 'self'(;| ws:;)/.test(csp), (csp.match(/connect-src[^;]*/) || [""])[0]);
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll smart rules checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
