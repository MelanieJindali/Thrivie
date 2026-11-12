/* Lighthouse (mobile) for the sign-in page and the signed-in Today screen.
 *   BASE_URL=http://localhost:3000 node e2e/lighthouse.cjs */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD (the demo account password from your .env) to run this."); process.exit(1); }
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const TARGETS = { performance: 90, accessibility: 90, "best-practices": 90, seo: 90 };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.locator("input[name=email]").fill("demo@thrivie.app");
  await p.locator("input[name=password]").fill(process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click();
  await p.waitForURL(BASE + "/");
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await b.close();
  let failed = false;
  for (const [name, path, headers] of [["Sign in", "/login", {}], ["Today", "/", { Cookie: cookie }]]) {
    const out = execFileSync("npx", ["lighthouse", BASE + path, "--quiet", "--output=json", "--form-factor=mobile",
      "--only-categories=performance,accessibility,best-practices,seo", `--extra-headers=${JSON.stringify(headers)}`,
      "--chrome-flags=--headless=new --no-sandbox"], { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, maxBuffer: 64 * 1024 * 1024 }).toString();
    const r = JSON.parse(out);
    const scores = Object.fromEntries(Object.keys(TARGETS).map((k) => [k, Math.round(r.categories[k].score * 100)]));
    const misses = Object.entries(scores).filter(([k, v]) => v < TARGETS[k]);
    if (misses.length) failed = true;
    console.log(`${name}: ${Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(" · ")}${misses.length ? "  ✗" : "  ✓"}`);
    if (misses.length) for (const a of Object.values(r.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary").slice(0, 8)) console.log("   -", a.id, a.title);
  }
  process.exit(failed ? 1 : 0);
})();
