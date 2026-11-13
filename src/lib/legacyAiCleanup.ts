// Removes the files left by the previous on-device model (WebLLM 0.2.87, replaced in Nov 2026).
// It stored the model in the browser under these names, in the Cache API or, on some setups,
// IndexedDB. They take a few hundred MB and nothing uses them any more.
export const LEGACY_STORES = ["webllm/model", "webllm/config", "webllm/wasm", "tvmjs-cos-hash-meta"];
const DONE_KEY = "thrivie-legacy-ai-cleaned";

/** Deletes the old model's caches and databases. Returns how many stores were removed. */
export async function removeLegacyAiFiles(): Promise<number> {
  let removed = 0;
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
