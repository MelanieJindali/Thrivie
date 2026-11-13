/* The previous on-device model's files (WebLLM) are removed from the browser once, in the background.
 *   DEMO_PASSWORD=… node e2e/legacycleanup.cjs        (app running on BASE_URL, seeded demo account)
 */
if (!process.env.DEMO_PASSWORD) { console.error("Set DEMO_PASSWORD to run this."); process.exit(1); }
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`); if (!ok) failures.push(name); };

(async () => {
  const browser = await chromium.launch();
  const p = await (await browser.newContext()).newPage();
  await p.goto(BASE + "/login");
  // Plant stores with the old model's names (Cache API and IndexedDB) plus one that must survive.
  await p.evaluate(async () => {
    for (const n of ["webllm/model", "webllm/config", "webllm/wasm", "tvmjs-cos-hash-meta", "transformers-cache"]) await (await caches.open(n)).put("/x", new Response("x"));
    await new Promise((r) => { const q = indexedDB.open("webllm/model"); q.onsuccess = () => { q.result.close(); r(); }; });
    localStorage.removeItem("thrivie-legacy-ai-cleaned");
  });
  await p.fill('input[name="email"]', process.env.DEMO_EMAIL || "demo@thrivie.app"); await p.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in with password" }).click(); await p.waitForURL(BASE + "/");
  await p.waitForFunction(() => localStorage.getItem("thrivie-legacy-ai-cleaned") === "1", null, { timeout: 15000 }).catch(() => {});
  const state = await p.evaluate(async () => ({ caches: await caches.keys(), dbs: (await indexedDB.databases()).map((d) => d.name), flag: localStorage.getItem("thrivie-legacy-ai-cleaned") }));
  check("old model caches removed", !state.caches.some((n) => n.startsWith("webllm/") || n === "tvmjs-cos-hash-meta"), state.caches.join(", "));
  check("old model database removed", !state.dbs.includes("webllm/model"), state.dbs.join(", "));
  check("current model cache untouched", state.caches.includes("transformers-cache"));
  check("runs only once", state.flag === "1");
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nAll legacy cleanup checks passed.");
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
