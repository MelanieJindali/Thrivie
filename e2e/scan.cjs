/* Food scanner flows in a real browser (Chromium, phone profile, fake camera).
 *   DEMO_PASSWORD=… E2E_DATABASE_URL=postgresql://…/thrivie node e2e/scan.cjs
 * Needs the app running on BASE_URL and the seeded demo account with Body & Goals set up.
 * The database URL is used to plant one shared product (so no outside lookup is needed),
 * to read back what was logged, and to clean up. Everything it creates is removed at the end.
 */
if (!process.env.DEMO_PASSWORD || !process.env.E2E_DATABASE_URL) { console.error("Set DEMO_PASSWORD and E2E_DATABASE_URL to run this."); process.exit(1); }
const { chromium, devices } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const { Client } = require("pg");
const fs = require("node:fs");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = process.env.DEMO_EMAIL || "demo@thrivie.app";
const KNOWN = "3017620422003"; // planted in the shared cache
const UNKNOWN = "96385074"; // a valid EAN-8 that is not planted
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };
const section = (t) => console.log(`\n${t}`);

let db, demoId;
const sql = async (q, p = []) => (await db.query(q, p)).rows;
const mealsToday = () => sql(`SELECT name, calories, "proteinG", servings, "foodId", nutrients, slot, notes FROM "Meal" WHERE "userId" = $1 AND "createdAt" > now() - interval '15 minutes' ORDER BY "createdAt"`, [demoId]);

// --- test images, drawn in the browser so nothing is committed ---------------------------------
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = L.map((p) => p.replace(/[01]/g, (b) => (b === "0" ? "1" : "0")));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
function ean13Bits(code) {
  const d = code.split("").map(Number);
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + "101";
}
const drawBarcode = (page, bits) => page.evaluate((bits) => {
  const m = 5, quiet = 14, c = document.createElement("canvas");
  c.width = (bits.length + quiet * 2) * m; c.height = 260;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#000";
  [...bits].forEach((b, i) => { if (b === "1") x.fillRect((quiet + i) * m, 30, m, 200); });
  return c.toDataURL("image/png").split(",")[1];
}, bits);
const LABEL_LINES = ["Nutrition Facts", "8 servings per container", "Serving size 2/3 cup (55g)", "Calories 230", "Total Fat 8g 10%", "Saturated Fat 1g 5%", "Trans Fat 0g", "Cholesterol 0mg 0%", "Sodium 160mg 7%", "Total Carbohydrate 37g 13%", "Dietary Fiber 4g 14%", "Total Sugars 12g", "Includes 10g Added Sugars 20%", "Protein 3g", "CONTAINS: WHEAT, SOY."];
const drawLabel = (page, lines) => page.evaluate((lines) => {
  const c = document.createElement("canvas"); c.width = 900; c.height = 80 + lines.length * 58;
  const x = c.getContext("2d"); x.fillStyle = "#e9e4da"; x.fillRect(0, 0, c.width, c.height); // a package-coloured margin to crop away
  x.fillStyle = "#fff"; x.fillRect(60, 30, 780, c.height - 60); x.fillStyle = "#111"; x.font = "bold 40px Arial";
  lines.forEach((l, i) => { x.font = i === 0 ? "bold 52px Arial" : "36px Arial"; x.fillText(l, 90, 100 + i * 56); });
  return c.toDataURL("image/png").split(",")[1];
}, lines);
const upload = (locator, b64, name) => locator.setInputFiles({ name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") });

async function signIn(page) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.locator("input[name=email]").fill(DEMO);
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(BASE + "/");
}
const openScan = async (page, tab = "barcode") => { await page.goto(`${BASE}/nutrition/scan?tab=${tab}`, { waitUntil: "networkidle" }); };
const typeBarcode = async (page, code) => {
  await page.getByRole("button", { name: "Type the barcode" }).click();
  await page.getByLabel("Barcode number").fill(code);
  await page.getByRole("button", { name: "Look up" }).click();
};
const src = fs.readFileSync(__dirname + "/matrix.cjs", "utf8");
const spills = eval("(" + src.slice(src.indexOf("function spills()"), src.indexOf("let storageState")).trim() + ")");
async function layout(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const sp = await page.evaluate(spills);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes[0].target.join(" ")}`);
  check(`${label}: no overflow, no spills, no accessibility violations`, overflow <= 1 && sp.length === 0 && bad.length === 0, [overflow > 1 && `overflow ${overflow}px`, ...sp, ...bad].filter(Boolean).join("; "));
}

(async () => {
  db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  [{ id: demoId }] = await sql(`SELECT set_config('app.system', 'on', false), (SELECT id FROM "User" WHERE email = $1) AS id`, [DEMO]);
  await sql(`SELECT set_config('app.user_id', $1, false)`, [demoId]);
  const cleanup = async () => {
    await sql(`DELETE FROM "Meal" WHERE "userId" = $1 AND "createdAt" > now() - interval '2 hours' AND ("foodId" IS NOT NULL OR notes IN ('Suggested for today') OR notes ~ '^[0-9]+ g$' OR name IN ('Banana', 'E2E granola', 'E2E oat bar'))`, [demoId]);
    await sql(`DELETE FROM "FavoriteFood" WHERE "userId" = $1`, [demoId]);
    await sql(`DELETE FROM "Food" WHERE "userId" = $1`, [demoId]);
    await sql(`DELETE FROM "Food" WHERE "userId" IS NULL AND barcode IN ($1, $2)`, [KNOWN, UNKNOWN]);
    await sql(`DELETE FROM "RateEvent"`);
    await sql(`UPDATE "Settings" SET "hideCalories" = false WHERE "userId" = $1`, [demoId]);
  };
  await cleanup();
  await sql(`INSERT INTO "Food"(id, source, barcode, name, brand, "servingSize", "servingGrams", "perServing", "per100g", allergens, traces) VALUES ('e2e-nutella', 'open_food_facts', $1, 'Nutella', 'Ferrero', '15 g', 15, $2, $3, 'dairy,nuts,soy', 'gluten')`,
    [KNOWN, JSON.stringify({ calories: 81, proteinG: 0.9, carbsG: 8.6, fatG: 4.6, sugarsG: 8.4 }), JSON.stringify({ calories: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, sugarsG: 56.3, sodiumMg: 43 })]);

  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const ctx = await browser.newContext({ ...devices["Pixel 7"], permissions: ["camera"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await signIn(page);

  section("Entry points and lazy loading");
  await page.goto(BASE + "/nutrition", { waitUntil: "networkidle" });
  check("Nutrition has a Scan food button", await page.getByRole("link", { name: "Scan food" }).count() >= 1);
  check("scanner engines are not loaded before the scanner opens", !requests.some((u) => /vendor\/(zxing|tesseract)|tesseract|zxing/.test(u)));
  await page.locator("button[aria-label*='Quick add'], button[aria-label*='quick add'], button[aria-label*='Log something']").first().click().catch(() => {});
  check("quick-add menu has Scan food", await page.getByRole("link", { name: /Scan food/ }).count() >= 1);

  section("Camera");
  const t0 = Date.now();
  await openScan(page);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.srcObject && v.readyState >= 2; }, null, { timeout: 15000 });
  const openMs = Date.now() - t0;
  check("camera starts by itself once permission was given, with a frame guide", await page.getByText("Line the barcode up in the frame").isVisible(), `${openMs} ms to live camera incl. page load`);
  check("privacy line is shown on the scanner", await page.getByText(/never uploaded/).isVisible());
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  check("camera stops when the app goes to the background", await page.evaluate(() => document.querySelector("video").srcObject === null));
  await page.evaluate(() => Object.defineProperty(document, "hidden", { value: false, configurable: true }));
  await page.getByRole("button", { name: "Start camera" }).click();
  await page.waitForFunction(() => document.querySelector("video")?.srcObject);
  await page.getByRole("tab", { name: "Search" }).click();
  check("camera stops when leaving the barcode tab", await page.evaluate(() => !document.querySelector("video")));

  section("Recognized barcode → logged");
  await openScan(page);
  await typeBarcode(page, KNOWN);
  await page.getByRole("heading", { name: "Nutella" }).waitFor();
  check("product screen shows name, brand and attribution", await page.getByText(/Ferrero/).isVisible() && await page.getByText(/Data from/).isVisible() && await page.getByRole("link", { name: "Open Food Facts" }).isVisible());
  check("fits-your-day note is shown", await page.locator("p.bg-seaglass-soft\\/70").count() >= 1, (await page.locator("p.bg-seaglass-soft\\/70").first().innerText().catch(() => "")).slice(0, 90));
  await page.getByRole("button", { name: "Half a serving more" }).click();
  await page.getByRole("button", { name: "Half a serving more" }).click();
  check("servings stepper updates the numbers", /162 kcal/.test(await page.locator("section[aria-labelledby=food-h]").innerText()));
  await layout(page, "product screen (Pixel 7)");
  await page.getByRole("button", { name: /^Log to / }).click();
  await page.getByRole("heading", { name: /^Logged to / }).waitFor();
  let rows = await mealsToday();
  let last = rows[rows.length - 1];
  check("entry saved with a nutrition snapshot, servings and food reference", !!last && last.calories === 162 && last.servings === 2 && last.foodId === "e2e-nutella" && JSON.parse(last.nutrients).sugarsG === 16.8, JSON.stringify(last));

  section("Barcode from a photo (uses the fallback reader in this browser)");
  await page.getByRole("button", { name: "Scan another" }).click();
  const t1 = Date.now();
  await upload(page.locator("input[type=file]").first(), await drawBarcode(page, ean13Bits(KNOWN)), "barcode.png");
  await page.getByRole("heading", { name: "Nutella" }).waitFor({ timeout: 20000 });
  check("barcode read from an image and looked up", true, `${Date.now() - t1} ms incl. first load of the reader and the lookup`);
  check("fallback reader came from Thrivie, not a CDN", requests.some((u) => u.includes("/vendor/zxing/zxing_reader.wasm")) && !requests.some((u) => /jsdelivr|unpkg|cdnjs/.test(u)));
  const t2 = Date.now();
  await page.getByRole("button", { name: "Back" }).click();
  await upload(page.locator("input[type=file]").first(), await drawBarcode(page, ean13Bits(KNOWN)), "barcode.png");
  await page.getByRole("heading", { name: "Nutella" }).waitFor();
  check("a second read is quick", Date.now() - t2 < 1500, `${Date.now() - t2} ms`);

  section("Allergen warning");
  const hasNuts = /nuts/.test(await page.locator("section[aria-labelledby=food-h]").innerText());
  await page.goto(BASE + "/me/body", { waitUntil: "networkidle" });
  const nuts = page.getByRole("button", { name: /Nuts$/ });
  if ((await nuts.getAttribute("aria-pressed")) !== "true") await nuts.click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByText(/Profile saved/).waitFor();
  await openScan(page); await typeBarcode(page, KNOWN);
  await page.getByRole("heading", { name: "Nutella" }).waitFor();
  const warn = await page.locator("section[aria-labelledby=food-h] [role=alert]").innerText().catch(() => "");
  check("warns before logging when the product has something on the allergy list", /Contains nuts/.test(warn) && /always check the package/.test(warn), warn.slice(0, 120) + (hasNuts ? "" : ""));

  section("Favorites, recents and search");
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await page.getByRole("button", { name: "Remove from favorites" }).waitFor();
  await openScan(page, "search");
  await page.getByRole("region", { name: "Favorites" }).waitFor();
  check("favorites appear first in search, before typing", (await page.getByRole("region", { name: "Favorites" }).innerText()).includes("Nutella"));
  await page.getByLabel("Search foods").fill("banana");
  await page.getByRole("region", { name: "Foods" }).waitFor();
  check("generic foods are found by name", (await page.getByRole("region", { name: "Foods" }).innerText()).includes("Banana"));
  await page.getByRole("region", { name: "Foods" }).getByRole("button", { name: /Banana/ }).first().click();
  await page.getByRole("radio", { name: "Grams" }).click();
  await page.getByLabel("Amount in grams").fill("200");
  check("grams give scaled nutrition", /178 kcal/.test(await page.locator("section[aria-labelledby=food-h]").innerText()));
  await page.getByRole("button", { name: /^Log to / }).click();
  await page.getByRole("heading", { name: /^Logged to / }).waitFor();
  rows = await mealsToday(); last = rows[rows.length - 1];
  check("generic food logged by weight, with its name encrypted at rest", last.calories === 178 && last.servings === 1.69 && last.foodId === null && String(last.name).startsWith("enc:"));

  section("Product not found → enter it → saved as your own food");
  await openScan(page); await typeBarcode(page, UNKNOWN);
  await page.getByRole("button", { name: "Scan the nutrition label" }).waitFor({ timeout: 20000 });
  check("no dead end: label scan, manual entry, search and rescan are all offered", (await page.getByRole("button", { name: "Enter it yourself" }).count()) === 1 && (await page.getByRole("button", { name: "Search by name" }).count()) === 1 && (await page.getByRole("button", { name: "Scan again" }).count()) === 1);
  await layout(page, "not-found screen (Pixel 7)");
  await page.getByRole("button", { name: "Scan the nutrition label" }).click();

  section("Nutrition label read on the device");
  const t3 = Date.now();
  await upload(page.locator("input[type=file]").nth(1), await drawLabel(page, LABEL_LINES), "label.png");
  await page.getByRole("heading", { name: "Check what was read" }).waitFor({ timeout: 90000 });
  const field = async (l) => page.getByLabel(new RegExp(`^${l} \\(`)).inputValue();
  const read = { cal: await field("Calories"), fat: await field("Total fat"), sod: await field("Sodium"), carb: await field("Total carbs"), fib: await field("Fiber"), sug: await field("Total sugars"), add: await field("Added sugars"), pro: await field("Protein") };
  check("label values read correctly", read.cal === "230" && read.fat === "8" && read.sod === "160" && read.carb === "37" && read.fib === "4" && read.sug === "12" && read.add === "10" && read.pro === "3", `${JSON.stringify(read)} in ${Date.now() - t3} ms incl. first load of the reader`);
  const grams = await page.getByLabel("Serving weight (g or ml)").inputValue();
  const on = await page.locator("button[aria-pressed=true].chip").allInnerTexts();
  check("serving size and allergens read", grams === "55" && on.some((t) => /Gluten/.test(t)) && on.some((t) => /Soy/.test(t)), `grams=${grams} size="${await page.getByLabel("Serving size (as printed)").inputValue()}" allergens=${on.join(",")}`);
  check("label reader came from Thrivie, not a CDN", requests.some((u) => u.includes("/vendor/tesseract/")) && !requests.some((u) => /jsdelivr|unpkg|cdnjs|tessdata\.projectnaptha/.test(u)));
  check("no image was uploaded anywhere", !requests.some((u) => /upload|\.png$/.test(u) && !u.startsWith("data:")));
  await page.getByLabel(/^Calories \(/).fill("23");
  await page.getByText(/don't quite match/).waitFor();
  check("a value that doesn't add up gets a gentle flag with a one-tap fix", await page.getByRole("button", { name: "Use 230" }).isVisible());
  await layout(page, "label review (Pixel 7)");
  await page.getByRole("button", { name: "Use 230" }).click();
  await page.getByLabel("Name").fill("E2E granola");
  await page.getByRole("button", { name: "Save food" }).click();
  await page.getByRole("heading", { name: "E2E granola" }).waitFor();
  await page.getByRole("button", { name: /^Log to / }).click();
  await page.getByRole("heading", { name: /^Logged to / }).waitFor();
  const [own] = await sql(`SELECT source, barcode, "userId" FROM "Food" WHERE "userId" = $1`, [demoId]);
  check("saved as a private food with the scanned barcode attached", own && own.source === "label_scan" && own.barcode === UNKNOWN);
  await page.getByRole("button", { name: "Scan another" }).click(); await page.getByRole("tab", { name: "Barcode" }).click(); await typeBarcode(page, UNKNOWN);
  await page.getByRole("heading", { name: "E2E granola" }).waitFor();
  check("scanning that barcode again finds your own food", (await page.getByText(/Serving: 2\/3 cup/).count()) >= 1);

  section("Building a meal from several items");
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByRole("heading", { name: /so far$/ }).waitFor();
  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByLabel("Search foods").fill("yogurt");
  await page.getByRole("region", { name: "Foods" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Add another item" }).click();
  const tray = await page.locator("section[aria-labelledby=tray-h]").innerText();
  check("combined totals and a comparison with a typical meal are shown", /kcal/.test(tray) && /typical/.test(tray), tray.replace(/\n/g, " | ").slice(0, 200));
  const before = (await mealsToday()).length;
  await page.getByRole("button", { name: /^Log 2 items/ }).click();
  await page.getByRole("heading", { name: /^Logged to / }).waitFor();
  check("both items logged together", (await mealsToday()).length === before + 2);

  section("Left today and suggestions");
  await page.goto(BASE + "/nutrition", { waitUntil: "networkidle" });
  const leftCard = page.locator("section[aria-labelledby=left-h]");
  const leftText = await leftCard.innerText();
  check("remaining calories, protein, carbs and fat are shown", /CALORIES/i.test(leftText) && /PROTEIN/i.test(leftText) && /CARBS/i.test(leftText) && /FAT/i.test(leftText) && /left of/.test(leftText));
  const sug = leftCard.getByRole("button", { name: /^Log it:/ });
  if (await sug.count()) {
    const n = (await mealsToday()).length; await sug.first().click();
    let added = false; for (let i = 0; i < 20 && !added; i++) { await page.waitForTimeout(400); added = (await mealsToday()).length === n + 1; }
    check("a suggestion can be logged in one tap", added);
  } else check("suggestions appear when there is room left today", /What to eat next/.test(leftText) || /0 kcal left|left of/.test(leftText), "none shown: little is left today for the demo account");
  await layout(page, "Nutrition with Left today (Pixel 7)");

  section("Hide calorie numbers");
  await sql(`UPDATE "Settings" SET "hideCalories" = true WHERE "userId" = $1`, [demoId]);
  await page.goto(BASE + "/nutrition", { waitUntil: "networkidle" });
  check("Left today shows guidance without calorie numbers", !/kcal|calories/i.test(await page.locator("section[aria-labelledby=left-h]").innerText()));
  await openScan(page); await typeBarcode(page, KNOWN);
  await page.getByRole("heading", { name: "Nutella" }).waitFor();
  check("product screen shows portions without calorie numbers", !/kcal|calorie/i.test(await page.locator("section[aria-labelledby=food-h]").innerText()));
  await sql(`UPDATE "Settings" SET "hideCalories" = false WHERE "userId" = $1`, [demoId]);

  section("Offline: a product scanned before still works");
  await openScan(page);
  await ctx.setOffline(true);
  await typeBarcode(page, KNOWN);
  await page.getByRole("heading", { name: "Nutella" }).waitFor({ timeout: 15000 });
  check("found from this device's copy while offline", true);
  const n0 = (await mealsToday()).length;
  await page.getByRole("button", { name: /^Log to / }).click();
  await page.getByRole("heading", { name: "Saved on this device" }).waitFor();
  check("logged offline is queued on the device", (await mealsToday()).length === n0);
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  let synced = false;
  for (let i = 0; i < 20 && !synced; i++) { await page.waitForTimeout(500); synced = (await mealsToday()).length === n0 + 1; }
  check("and syncs when back online", synced);

  section("Layout at 320, 768 and 1440 px, light and dark");
  for (const theme of ["light", "dark"]) for (const w of [320, 768, 1440]) {
    const c = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: theme, permissions: ["camera"] });
    const p = await c.newPage(); await signIn(p);
    await openScan(p); await layout(p, `scanner ${w}px ${theme}`);
    await typeBarcode(p, KNOWN); await p.getByRole("heading", { name: "Nutella" }).waitFor(); await layout(p, `product ${w}px ${theme}`);
    await openScan(p, "search"); await p.getByLabel("Search foods").fill("rice"); await p.getByRole("region", { name: "Foods" }).waitFor(); await layout(p, `search ${w}px ${theme}`);
    await p.getByRole("button", { name: "Add your own food" }).click(); await p.getByRole("heading", { name: "Add your own food" }).waitFor(); await layout(p, `editor ${w}px ${theme}`);
    await p.goto(BASE + "/nutrition", { waitUntil: "networkidle" }); await layout(p, `nutrition ${w}px ${theme}`);
    await c.close();
  }
  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close(); await browser.close();

  section("Camera permission denied");
  const b2 = await chromium.launch(); // no fake-permission flag: the camera request is refused
  const c2 = await b2.newContext({ ...devices["Pixel 7"] });
  const p2 = await c2.newPage(); await signIn(p2); await openScan(p2);
  await p2.getByRole("button", { name: "Start camera" }).click();
  await p2.getByText(/Camera access is off|No camera is available/).waitFor({ timeout: 15000 });
  const refused = await p2.locator("#scan-panel").innerText();
  check("a refused camera explains itself and keeps every other way open", /type the barcode, choose a photo, or search/i.test(refused) && /Type the barcode/.test(refused) && /Choose a photo/.test(refused) && (await p2.getByRole("tab", { name: "Search" }).count()) === 1, refused.replace(/\n/g, " | ").slice(0, 200));
  await typeBarcode(p2, KNOWN); await p2.getByRole("heading", { name: "Nutella" }).waitFor();
  check("typing the barcode works without the camera", true);
  await b2.close();

  // Leave the demo account as it was.
  const b3 = await chromium.launch(); const p3 = await (await b3.newContext()).newPage(); await signIn(p3);
  await p3.goto(BASE + "/me/body", { waitUntil: "networkidle" });
  const nb = p3.getByRole("button", { name: /Nuts$/ });
  if ((await nb.getAttribute("aria-pressed")) === "true") { await nb.click(); await p3.getByRole("button", { name: "Save profile" }).click(); await p3.getByText(/Profile saved/).waitFor(); }
  await b3.close();
  await cleanup();
  await db.end();
  console.log(failures.length ? `\n${failures.length} FAILED:\n- ${failures.join("\n- ")}` : "\nAll scanner checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
