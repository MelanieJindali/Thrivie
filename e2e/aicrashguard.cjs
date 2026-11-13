/* On-device AI crash guard: if loading the model closed the tab last time, the next visit doesn't try again.
 *   DEMO_PASSWORD=… node e2e/aicrashguard.cjs     (app running on BASE_URL; demo account with on-device AI turned on)
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
  const modelRequests = [];
  p.on("request", (r) => { if (/huggingface|hf\.co/.test(r.url())) modelRequests.push(r.url()); });
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");

  console.log("\nphone whose last load closed the tab");
  // What a crash leaves behind: the busy note for the phone model, never cleared.
  await p.evaluate(() => localStorage.setItem("thrivie-ai-busy", "HuggingFaceTB/SmolLM2-135M-Instruct"));
  await p.goto(BASE + "/");
  const card = p.locator("#brief-title").locator("xpath=ancestor::section");
  await card.getByText("On-device AI unsupported on this browser").waitFor({ timeout: 8000 }).catch(() => {});
  check("says it's unsupported instead of trying again", await card.getByText("On-device AI unsupported on this browser").isVisible());
  check("no rewrite button", (await card.getByRole("button", { name: /Rewrite/ }).count()) === 0);
  check("brief still shows", (await card.locator("p.font-display").first().innerText()).length > 20);
  check("the crash is remembered", await p.evaluate(() => (localStorage.getItem("thrivie-ai-crashed") || "").includes("SmolLM2-135M")));
  await p.goto(BASE + "/import");
  await p.getByRole("textbox", { name: "Notes to import" }).fill("Wed - spin class at the Y, brutal but fun");
  await p.waitForTimeout(1500);
  check("Import shows the same status, no Enhance button", (await p.getByText("On-device AI unsupported on this browser").count()) > 0 && (await p.getByRole("button", { name: /Enhance/ }).count()) === 0);
  check("nothing was downloaded", modelRequests.length === 0, `${modelRequests.length} requests`);

  console.log("\nnormal navigation isn't mistaken for a crash");
  await p.evaluate(() => { localStorage.removeItem("thrivie-ai-crashed"); localStorage.setItem("thrivie-ai-busy", "x"); });
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  check("leaving the page clears the busy note", await p.evaluate(() => localStorage.getItem("thrivie-ai-busy") === null));

  await p.evaluate(() => { localStorage.removeItem("thrivie-ai-crashed"); localStorage.removeItem("thrivie-ai-busy"); });
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll crash guard checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
