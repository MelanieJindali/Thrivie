/* Body & Goals: each goal shows its own note under the daily target, right above the disclaimer, without the card jumping.
 *   DEMO_PASSWORD=… node e2e/goalnotes.cjs [screenshot-dir]     (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const shots = process.argv[2];
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };
const NOTES = {
  "Lose weight": "A steady calorie deficit drives weight loss, while balanced protein helps keep you full and energized throughout the day.",
  "Fat loss": "Protein is set higher on this goal to help you keep muscle during a calorie deficit. Regular strength training helps too.",
  "Maintain": "Calories are set to match your daily energy burn, keeping your weight steady while fueling everyday performance and recovery.",
  "Gain muscle": "A slight calorie surplus paired with elevated protein gives your body the fuel and building blocks it needs to grow new muscle.",
};

(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [["phone", { ...devices["iPhone 13"], defaultBrowserType: undefined }], ["tablet", { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 }]]) {
    console.log(`\n${label}`);
    const p = await (await browser.newContext(opts)).newPage();
    await p.goto(BASE + "/login");
    await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
    await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");
    await p.goto(BASE + "/me/body");
    const card = p.locator("section[aria-labelledby=targets-h]");
    await card.waitFor();
    const seen = new Set(); const heights = [];
    for (const [goal, note] of Object.entries(NOTES)) {
      await p.getByRole("radio", { name: goal }).click();
      // The next frame already has the new numbers and note: nothing loads, so nothing flickers.
      const state = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => {
        const c = document.querySelector("section[aria-labelledby=targets-h]");
        const ps = [...c.querySelectorAll("p")].map((x) => x.textContent);
        r({ ps, numbers: [...c.querySelectorAll("dd")].map((x) => x.textContent).join(" "), height: Math.round(c.getBoundingClientRect().height) });
      })));
      const at = state.ps.indexOf(note);
      check(`${goal}: its note shows`, at >= 0);
      check(`${goal}: no other goal's note shows`, Object.values(NOTES).filter((n) => state.ps.includes(n)).length === 1);
      check(`${goal}: the note sits right above the disclaimer`, at >= 0 && (state.ps[at + 1] || "").startsWith("Plans are general guidance"));
      const style = await card.getByText(note).evaluate((el) => { const s = getComputedStyle(el); return `${s.fontSize} ${s.color} ${s.fontFamily.split(",")[0]}`; });
      const ref = await card.getByText("Plans are general guidance").evaluate((el) => getComputedStyle(el).color);
      check(`${goal}: muted note styling`, style.startsWith("14px") && style.includes(ref), style);
      seen.add(state.numbers); heights.push(state.height);
      if (shots) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${shots}/target-${label}-${goal.toLowerCase().replace(/ /g, "-")}.png` }); }
    }
    check("each goal has its own targets", seen.size === 4);
    check("the card keeps its height across goals", Math.max(...heights) - Math.min(...heights) <= 1, heights.join(", "));
    await p.context().close();
  }
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll goal note checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
