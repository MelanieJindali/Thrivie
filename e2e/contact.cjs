/* "Contact us" form in Settings, in a real browser (Chromium, phone profile).
 *   DEMO_PASSWORD=… node e2e/contact.cjs
 * Needs the app running on BASE_URL with SUPPORT_EMAIL set and the seeded demo account.
 * Email isn't delivered in tests (the email key is a placeholder), so a send ends in the
 * friendly "couldn't be sent" message; the checks cover the form, validation, limits and logs.
 * Set NEXT_LOG to the server's log file to check that message text is never logged.
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const fs = require("fs");
const { chromium, devices } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = process.env.DEMO_EMAIL || "demo@thrivie.app";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };

(async () => {
  const browser = await chromium.launch();
  for (const device of ["iPhone SE", "iPhone 13"]) {
    console.log(`\n${device}`);
    const ctx = await browser.newContext({ ...devices[device], defaultBrowserType: undefined });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(BASE + "/login");
    await p.fill('input[name="email"]', DEMO);
    await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
    await p.getByRole("button", { name: "Sign in with password" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
    await p.goto(BASE + "/me#contact");
    const form = p.getByRole("form", { name: "Contact the Thrivie team" });
    await form.waitFor();
    check("Contact us card is in Settings", await p.getByRole("heading", { name: "Contact us" }).isVisible());
    const topics = form.getByRole("radiogroup", { name: "Topic" }).getByRole("radio");
    check("five categories", (await topics.count()) === 5, await topics.allInnerTexts().then((t) => t.map((x) => x.split("\n")[0]).join(", ")));
    check("message box appears only after picking a category", (await form.getByLabel("Message").count()) === 0);

    // every category shows its own sub-topics
    const counts = {};
    for (const name of ["Personal coaching", "General health", "App help", "Report a problem", "Feedback and ideas"]) {
      await form.getByRole("radio", { name: new RegExp("^" + name) }).click();
      counts[name] = await form.getByRole("radiogroup", { name: `${name} topic` }).getByRole("radio").count();
    }
    check("each category has its sub-topics", Object.values(counts).every((n) => n >= 4), JSON.stringify(counts));

    await form.getByRole("radio", { name: /^General health/ }).click();
    check("health topics show the not-for-emergencies note", await form.getByText(/can't give medical advice/).isVisible());
    await form.getByRole("radio", { name: /^Report a problem/ }).click();
    check("problems ask how much it affects you", await form.getByRole("radiogroup", { name: "Impact" }).isVisible());
    check("device details are on by default for problems", await form.getByLabel(/Include device details/).isChecked());
    check("reply-to shows the account email", await form.getByText(DEMO).isVisible());

    await form.getByLabel("Message").fill("Weekly average looks too high on Insights.");
    await form.getByRole("button", { name: "Send message" }).click();
    check("asks for a sub-topic first", await form.getByText("Choose a topic first.").isVisible());
    await form.getByRole("radio", { name: "Wrong numbers or calculations" }).click();
    await form.getByRole("button", { name: "Send message" }).click();
    check("asks how much it affects you", await form.getByText("Choose how much this affects you.").isVisible());
    await form.getByRole("radio", { name: "Gets in the way" }).click();

    const axe = await new AxeBuilder({ page: p }).include("#contact").analyze();
    check("no accessibility violations", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 60)}`).join(" | "));
    const small = await p.locator("#contact").evaluate((el) => [...el.querySelectorAll("button, input, textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && e.type !== "checkbox" && r.height < 43.5; }).map((e) => (e.textContent || e.id).trim().slice(0, 25)));
    check("controls are at least 44px tall", small.length === 0, small.join(" | "));
    check("no sideways scroll", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

    const secret = "e2e-contact-" + Date.now();
    await form.getByLabel("Message").fill("Weekly average looks too high. " + secret);
    await form.getByRole("button", { name: "Send message" }).click();
    await form.getByRole("alert").waitFor({ timeout: 20000 });
    const alert = await form.getByRole("alert").innerText();
    check("a failed send shows a friendly error and keeps the text", /couldn't be sent|try again/i.test(alert) && (await form.getByLabel("Message").inputValue()).includes(secret), alert);
    if (process.env.NEXT_LOG) {
      const log = fs.readFileSync(process.env.NEXT_LOG, "utf8");
      check("message text and email never reach the server log", !log.includes(secret) && !log.includes(DEMO));
      check("the failure is logged without details", log.includes("[email] contact message not sent"));
    }
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  console.log("\nLimits");
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], defaultBrowserType: undefined });
    const p = await ctx.newPage();
    await p.goto(BASE + "/login");
    await p.fill('input[name="email"]', DEMO);
    await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
    await p.getByRole("button", { name: "Sign in with password" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
    await p.goto(BASE + "/me#contact");
    const form = p.getByRole("form", { name: "Contact the Thrivie team" });
    await form.getByRole("radio", { name: /^Feedback and ideas/ }).click();
    await form.getByRole("radio", { name: "General feedback" }).click();
    await form.getByLabel("Message").fill("Loving the new themes, thank you.");
    // two sends above already counted towards the hourly limit of 3
    let last = "";
    for (let i = 0; i < 2; i++) {
      await form.getByRole("button", { name: "Send message" }).click();
      await p.waitForFunction(() => !document.querySelector('#contact [aria-busy="true"]'));
      await form.getByRole("alert").waitFor({ timeout: 20000 });
      last = await form.getByRole("alert").innerText();
    }
    check("a fourth message within the hour is held back", /sent several messages recently/.test(last), last);
    await ctx.close();
  }

  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} contact check(s) failed.`); process.exit(1); }
  console.log("\nAll contact checks passed.");
})().catch((e) => { console.error(e.message); process.exit(1); });
