// Removes what the on-device AI models left in the browser. Thrivie no longer uses a model
// (Smart Import and the daily brief are rule-based), so these files, up to a few hundred MB,
// serve no purpose: WebLLM's stores (Cache API or IndexedDB) and the Transformers.js cache.
export const LEGACY_STORES = ["webllm/model", "webllm/config", "webllm/wasm", "tvmjs-cos-hash-meta", "transformers-cache"];
const LEGACY_KEYS = ["thrivie-ai-busy", "thrivie-ai-crashed", "thrivie-legacy-ai-cleaned"];
const DONE_KEY = "thrivie-ai-files-removed";

/** Deletes the old model's caches and databases. Returns how many stores were removed. */
export async function removeLegacyAiFiles(): Promise<number> {
  let removed = 0;
  for (const k of LEGACY_KEYS) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } }
  try { sessionStorage.removeItem("thrivie-ai-unsupported"); sessionStorage.removeItem("thrivie-brief-rewrite"); } catch { /* storage blocked */ }
  if (typeof caches !== "undefined") {
    for (const name of LEGACY_STORES) if (await caches.delete(name).catch(() => false)) removed++;
  }
  if (typeof indexedDB !== "undefined") {
    const names = typeof indexedDB.databases === "function"
      ? (await indexedDB.databases().catch(() => [])).map((d) => d.name ?? "").filter((n) => LEGACY_STORES.includes(n))
      : LEGACY_STORES; // older Safari can't list databases; deleting a missing one is harmless
    for (const name of names) {
      const ok = await new Promise<boolean>((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve(true);
        req.onerror = req.onblocked = () => resolve(false);
      });
      if (ok && typeof indexedDB.databases === "function") removed++;
    }
  }
  return removed;
}

/** Runs the cleanup once per browser, when the page is idle. */
export function cleanUpLegacyAiOnce(): void {
  try { if (localStorage.getItem(DONE_KEY)) return; } catch { return; }
  const run = () => void removeLegacyAiFiles().then(() => { try { localStorage.setItem(DONE_KEY, "1"); } catch { /* storage blocked */ } }).catch(() => {});
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(run, { timeout: 10_000 });
  else setTimeout(run, 3000);
}
