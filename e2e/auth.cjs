/* Sign-in flows in a real browser (Chromium) with a virtual Face ID / Touch ID authenticator.
 *   DEMO_PASSWORD=… E2E_DATABASE_URL=postgresql://…/thrivie node e2e/auth.cjs
 * Needs the app running on BASE_URL with email configured (RESEND_API_KEY, EMAIL_FROM, APP_URL
 * may be dummy values locally) and open sign-ups. Uses the seeded demo account and creates one
 * throwaway account, which it deletes at the end. The database URL is used only to read back
 * state and to plant a known sign-in code (the app stores only code hashes).
 */
if (!process.env.DEMO_PASSWORD || !process.env.E2E_DATABASE_URL) { console.error("Set DEMO_PASSWORD and E2E_DATABASE_URL to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const { Client } = require("pg");
const crypto = require("node:crypto");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = process.env.DEMO_EMAIL || "demo@thrivie.app";
const BANNER = "Upgrade to instant Face ID / Touch ID login for faster access.";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };

let db;
const sql = async (q, p = []) => (await db.query(q, p)).rows;
async function plantCode(email, code) {
  const id = crypto.randomBytes(12).toString("hex");
  const value = crypto.createHash("sha256").update(`thrivie-code:${id}:${code}`).digest("hex");
  await sql(`DELETE FROM "AuthChallenge" WHERE kind = 'email-code' AND subject = $1`, [email]);
  await sql(`INSERT INTO "AuthChallenge"(id, kind, subject, value, "expiresAt") VALUES ($1, 'email-code', $2, $3, now() + interval '10 minutes')`, [id, email, value]);
}

async function withDevice(browser, deviceName, fn) {
  const ctx = await browser.newContext({ ...devices[deviceName] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  // "Touching the sensor" can be switched off, so a page can load without the autofill request signing in by itself.
  const touch = (enabled) => cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled });
  await fn(page, ctx, touch);
  check(`${deviceName}: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
const sessionCookie = async (ctx) => (await ctx.cookies()).find((c) => /thrivie/.test(c.name) && c.name !== "thrivie_wa");
const passwordSignIn = async (page, email, pw) => {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.locator("input[name=email]").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pw);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(BASE + "/");
};

/** Every visible control must be at least 48 × 48 CSS pixels. */
async function touchTargets(page, label, scope = "main") {
  const small = await page.evaluate((scope) => [...document.querySelectorAll(["a", "button", "input:not([type=hidden])", "select", "[role=tab]"].map((s) => `${scope} ${s}`).join(", "))]
    .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
    .map((el) => ({ r: el.getBoundingClientRect(), name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 40) }))
    .filter((x) => x.r.width < 47.5 || x.r.height < 47.5)
    .map((x) => `${x.name} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`), scope);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${label}: touch targets ≥ 48×48`, small.length === 0, small.join("; "));
  check(`${label}: no horizontal scroll`, overflow <= 1, `${overflow}px`);
}

(async () => {
  db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  await sql("SELECT set_config('app.system', 'on', false)");
  const [demo] = await sql(`SELECT id, "passwordHash" FROM "User" WHERE email = $1`, [DEMO]);
  if (!demo) { console.error(`No ${DEMO} account. Seed the database first.`); process.exit(1); }
  const reset = async () => {
    await sql(`DELETE FROM "Passkey" WHERE "userId" = $1`, [demo.id]);
    await sql(`DELETE FROM "RateEvent"`);
    await sql(`UPDATE "Settings" SET "tipsSeen" = array_to_string(array_remove(string_to_array("tipsSeen", ','), 'passkey'), ',') WHERE "userId" = $1`, [demo.id]);
  };
  const browser = await chromium.launch();

  for (const device of ["iPhone 13", "Pixel 7"]) {
    console.log(`\n${device}`);
    await reset();
    await withDevice(browser, device, async (page, ctx, touch) => {
      // Path C: an existing password account signs in exactly as before.
      await passwordSignIn(page, DEMO, process.env.DEMO_PASSWORD);
      check("legacy password sign-in works", new URL(page.url()).pathname === "/");
      const cookie = await sessionCookie(ctx);
      check("session cookie is HttpOnly, SameSite=Lax", !!cookie && cookie.httpOnly && cookie.sameSite === "Lax", cookie && `${cookie.name} httpOnly=${cookie.httpOnly} sameSite=${cookie.sameSite}`);

      // Upgrade prompt, then one tap to add a passkey. The session is aged first to check rotation.
      const banner = page.getByRole("region", { name: "Faster sign-in" });
      await banner.waitFor();
      check("upgrade banner shows the agreed wording", (await banner.innerText()).includes(BANNER));
      await touchTargets(page, "upgrade banner", "[aria-label='Faster sign-in']");
      await sql(`UPDATE "Session" SET "createdAt" = now() - interval '2 days' WHERE "userId" = $1`, [demo.id]);
      await banner.getByRole("button", { name: "Set up now" }).click();
      await page.getByText(/You're set\./).first().waitFor();
      check("one tap registers a passkey", (await sql(`SELECT count(*)::int AS n FROM "Passkey" WHERE "userId" = $1`, [demo.id]))[0].n === 1);
      check("password hash untouched by the upgrade", (await sql(`SELECT "passwordHash" FROM "User" WHERE id = $1`, [demo.id]))[0].passwordHash === demo.passwordHash);
      const rotated = await sessionCookie(ctx);
      check("day-old session token was rotated", !!rotated && rotated.value !== cookie.value);
      await page.goto(BASE + "/me", { waitUntil: "networkidle" });
      check("still signed in after rotation", new URL(page.url()).pathname === "/me");
      check("passkey listed on Me", await page.getByText(/^Added /).count() === 1);
      await page.goto(BASE + "/");
      check("banner gone once a passkey exists", await page.getByRole("region", { name: "Faster sign-in" }).count() === 0);

      // Path A: sign in with the passkey, no password and no email typed.
      await ctx.clearCookies();
      await touch(false);
      await page.goto(BASE + "/login", { waitUntil: "networkidle" });
      check("email field offers passkeys in autofill", (await page.locator("input[name=email]").getAttribute("autocomplete")) === "username webauthn");
      await touchTargets(page, "sign-in page");
      await touch(true);
      await page.getByRole("button", { name: /Sign in with Face ID, Touch ID or passkey/ }).click();
      await page.waitForURL(BASE + "/");
      check("passkey sign-in works", true);
      check("session records the passkey method", (await sql(`SELECT method FROM "Session" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [demo.id]))[0].method === "passkey");

      // Path B: emailed code.
      await touch(false);
      await ctx.clearCookies();
      await page.goto(BASE + "/login/code", { waitUntil: "networkidle" });
      await touchTargets(page, "code request page");
      await page.locator("input[name=email]").fill(DEMO);
      await page.getByRole("button", { name: "Email me a code" }).click();
      const code = page.locator("input[name=code]");
      await code.waitFor();
      check("code field: numeric keyboard and one-time-code autofill", (await code.getAttribute("inputmode")) === "numeric" && (await code.getAttribute("autocomplete")) === "one-time-code");
      await touchTargets(page, "code entry page");
      await plantCode(DEMO, "246810");
      await code.fill("135790");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.locator("p[role=alert]").waitFor();
      check("wrong code is refused", /isn't right/.test(await page.locator("p[role=alert]").innerText()));
      await page.locator("input[name=code]").fill("246810");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(BASE + "/");
      check("right code signs in", true);
      await ctx.clearCookies();
      await page.goto(BASE + "/login/code", { waitUntil: "networkidle" });
      await page.locator("input[name=email]").fill(DEMO);
      await page.getByRole("button", { name: "Email me a code" }).click();
      await page.locator("input[name=code]").fill("246810");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.locator("p[role=alert]").waitFor();
      check("a used code can't be used again", true);

      for (const path of ["/signup", "/login/forgot"]) { await page.goto(BASE + path, { waitUntil: "networkidle" }); await touchTargets(page, path); }
    });
  }

  // New user, no password at all: sign up, add a passkey, sign in with it.
  console.log("\nNew passwordless account (Pixel 7)");
  const email = `e2e-${crypto.randomBytes(4).toString("hex")}@example.com`;
  await withDevice(browser, "Pixel 7", async (page, ctx, touch) => {
    await page.goto(BASE + "/signup", { waitUntil: "networkidle" });
    await page.locator("input[name=email]").fill(email);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/welcome/);
    const [u] = await sql(`SELECT id, "hasPassword" FROM "User" WHERE email = $1`, [email]);
    check("account created without a password", !!u && u.hasPassword === false);
    await sql(`UPDATE "Settings" SET onboarded = true WHERE "userId" = $1`, [u.id]);
    await page.goto(BASE + "/me", { waitUntil: "networkidle" });
    check("no upgrade banner for a passwordless sign-up", await page.getByRole("region", { name: "Faster sign-in" }).count() === 0);
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await page.getByText(/^Added /).waitFor();
    check("new user registers a passkey", true);
    await ctx.clearCookies();
    await touch(false);
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await touch(true);
    await page.getByRole("button", { name: /Sign in with Face ID, Touch ID or passkey/ }).click();
    await page.waitForURL(BASE + "/");
    check("new user signs in with the passkey", true);
    await page.goto(BASE + "/me", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Remove passkey/ }).click();
    await page.getByText(/^Added /).waitFor({ state: "detached" });
    check("a passkey can be removed", (await sql(`SELECT count(*)::int AS n FROM "Passkey" WHERE "userId" = $1`, [u.id]))[0].n === 0);
    await touch(false);
    await ctx.clearCookies();
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.locator("input[name=email]").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("any password at all");
    await page.getByRole("button", { name: "Sign in with password" }).click();
    await page.locator("p[role=alert]").waitFor();
    check("no password can open a passwordless account", new URL(page.url()).pathname === "/login");
  });
  await sql(`DELETE FROM "User" WHERE email = $1`, [email]);
  await reset();

  await browser.close();
  await db.end();
  console.log(failures.length ? `\n${failures.length} FAILED:\n- ${failures.join("\n- ")}` : "\nAll sign-in checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
