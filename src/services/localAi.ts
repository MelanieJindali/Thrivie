"use client";

// On-device AI for the daily brief rewrite and the Smart Import "Enhance" button.
// Everything runs in the browser: no cloud API, no server, and no text leaves the device.
//
// Three tiers, picked per device:
//   1. builtin  Desktop Chrome's built-in model (the Prompt API). Nothing to download.
//   2. desktop  Qwen2.5-0.5B-Instruct through Transformers.js in a Web Worker (WebGPU, or WebAssembly).
//   3. mobile   SmolLM2-360M-Instruct, a smaller model for phones, tablets and low-memory devices,
//               with shorter replies so the tab stays within the browser's memory limit.
// Model files are downloaded once, only after the person turns the feature on, and kept in the
// browser's cache so later visits work offline.

export type AiTier = "builtin" | "desktop" | "mobile";
export type AiState = "idle" | "downloading" | "loading" | "ready" | "unsupported";
export type AiProgress = { pct: number; sizeMb: number };
export type GenerateOptions = {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Worked examples (input and the ideal reply). Small models follow these far better than instructions alone. */
  examples?: { input: string; output: string }[];
  /** Called for each piece of text as it is written. */
  onToken?: (delta: string, full: string) => void;
};

type ModelSpec = { id: string; name: string; sizeMb: Record<"q4" | "q4f16", number>; maxTokens: number };
export const MODELS: Record<"desktop" | "mobile", ModelSpec> = {
  // The ONNX build of Qwen/Qwen2.5-0.5B-Instruct (the original repository has no browser-ready files).
  desktop: { id: "onnx-community/Qwen2.5-0.5B-Instruct", name: "Qwen2.5 0.5B", sizeMb: { q4: 786, q4f16: 483 }, maxTokens: 256 },
  mobile: { id: "HuggingFaceTB/SmolLM2-360M-Instruct", name: "SmolLM2 360M", sizeMb: { q4: 388, q4f16: 273 }, maxTokens: 150 },
};
const CACHE = "transformers-cache";
const UNSUPPORTED_KEY = "thrivie-ai-unsupported";
const GENERATE_TIMEOUT_MS = 120_000;

type Plan = { tier: AiTier; model?: ModelSpec; device?: "webgpu" | "wasm"; dtype?: "q4" | "q4f16" };

// --- Chrome's built-in Prompt API (typed loosely: it is not in TypeScript's DOM library yet) ---
type LmSession = { promptStreaming: (text: string) => AsyncIterable<string>; clone?: () => Promise<LmSession>; destroy: () => void };
type LmApi = { availability: (o?: unknown) => Promise<string>; create: (o?: unknown) => Promise<LmSession> };
const LM_LANG = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const lmApi = (): LmApi | null => (globalThis as unknown as { LanguageModel?: LmApi }).LanguageModel ?? null;
async function builtinAvailable(): Promise<boolean> {
  const api = lmApi();
  if (!api) return false;
  try { return (await api.availability(LM_LANG)) === "available"; } catch { /* older signature */ }
  try { return (await api.availability()) === "available"; } catch { return false; }
}

// --- Device detection -------------------------------------------------------------------------
export function isConstrainedDevice(nav: { userAgent: string; maxTouchPoints?: number; deviceMemory?: number } = navigator as never): boolean {
  const ua = nav.userAgent;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Silk|Opera Mini/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1); // iPadOS reports as a Mac
  return mobileUa || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4);
}

type Adapter = { features: { has: (f: string) => boolean } };
async function gpuAdapter(): Promise<Adapter | null> {
  try { return (await (navigator as unknown as { gpu?: { requestAdapter: () => Promise<Adapter | null> } }).gpu?.requestAdapter()) ?? null; } catch { return null; }
}

let planPromise: Promise<Plan | null> | null = null;
/** Which tier this device will use, or null when it can't run on-device AI at all. */
export function getPlan(): Promise<Plan | null> {
  planPromise ??= (async (): Promise<Plan | null> => {
    if (typeof window === "undefined") return null;
    try { if (sessionStorage.getItem(UNSUPPORTED_KEY)) return null; } catch { /* storage blocked */ }
    const constrained = isConstrainedDevice();
    if (!constrained && (await builtinAvailable())) return { tier: "builtin" };
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined" || typeof caches === "undefined") return null;
    const adapter = await gpuAdapter();
    const f16 = !!adapter?.features.has("shader-f16");
    // With 16-bit GPU support the smaller q4f16 files are used; everything else gets q4.
    return { tier: constrained ? "mobile" : "desktop", model: constrained ? MODELS.mobile : MODELS.desktop, device: adapter ? "webgpu" : "wasm", dtype: adapter && f16 ? "q4f16" : "q4" };
  })();
  return planPromise;
}
export const downloadSizeMb = (p: Plan) => (p.model && p.dtype ? p.model.sizeMb[p.dtype] : 0);

// --- Status, for the badges in the UI ---------------------------------------------------------
let state: AiState = "idle";
let progress: AiProgress | null = null;
const listeners = new Set<() => void>();
function setState(s: AiState, p: AiProgress | null = null) { state = s; progress = p; listeners.forEach((l) => l()); }
export const getAiState = () => ({ state, progress });
export function onAiState(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
function markUnsupported() {
  try { sessionStorage.setItem(UNSUPPORTED_KEY, "1"); } catch { /* storage blocked */ }
  planPromise = Promise.resolve(null);
  release();
  setState("unsupported");
}

// --- Model cache ------------------------------------------------------------------------------
async function cachedModelFiles(modelId: string): Promise<Request[]> {
  try { return (await (await caches.open(CACHE)).keys()).filter((r) => r.url.includes(`/${modelId}/`)); } catch { return []; }
}
/** True when nothing needs downloading before the first use. */
export async function isAiReady(): Promise<boolean> {
  const plan = await getPlan();
  if (!plan) return false;
  if (plan.tier === "builtin") return true;
  return (await cachedModelFiles(plan.model!.id)).some((r) => r.url.endsWith(".onnx"));
}
/** Removes every downloaded model file from this device. */
export async function deleteAiDownloads(): Promise<void> {
  release();
  try {
    const cache = await caches.open(CACHE);
    for (const m of Object.values(MODELS)) for (const r of await cachedModelFiles(m.id)) await cache.delete(r);
  } catch { /* nothing cached */ }
}

// --- The worker (tiers 2 and 3) ---------------------------------------------------------------
let worker: Worker | null = null;
let loading: Promise<void> | null = null;
let jobSeq = 0;
type Job = { resolve: (text: string) => void; reject: (e: Error) => void; onToken?: GenerateOptions["onToken"]; full: string };
const jobs = new Map<number, Job>();
let loadWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;

function failAll(e: Error) {
  jobs.forEach((j) => j.reject(e));
  jobs.clear();
  loadWaiter?.reject(e);
  loadWaiter = null;
}

function startWorker(plan: Plan, fromCache: boolean): Worker {
  const w = new Worker(new URL("./localAi.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ type: string; id?: number; delta?: string; text?: string; loaded?: number; total?: number; stage?: string; message?: string }>) => {
    const m = e.data;
    // Reading files back from the cache reports progress too; that's starting up, not downloading.
    if (m.type === "progress" && m.total && fromCache) setState("loading");
    else if (m.type === "progress" && m.total) setState("downloading", { pct: Math.min(99, Math.round(((m.loaded ?? 0) / m.total) * 100)), sizeMb: Math.max(downloadSizeMb(plan), Math.round(m.total / 1e6)) });
    else if (m.type === "ready") { setState("ready"); loadWaiter?.resolve(); loadWaiter = null; }
    else if (m.type === "token" && m.id != null) { const j = jobs.get(m.id); if (j) { j.full += m.delta ?? ""; j.onToken?.(m.delta ?? "", j.full); } }
    else if (m.type === "done" && m.id != null) { const j = jobs.get(m.id); jobs.delete(m.id); j?.resolve(m.text ?? j.full); }
    else if (m.type === "error") {
      const err = new Error(m.message ?? "on-device AI failed");
      console.warn(`[on-device AI] ${m.stage} failed: ${err.message}`); // the error only, never the text being processed
      if (m.stage === "load") { failAll(err); markUnsupported(); }
      else if (m.id != null) { const j = jobs.get(m.id); jobs.delete(m.id); j?.reject(err); }
    }
  };
  // A worker that dies (out of memory, blocked script) takes its jobs with it.
  w.onerror = () => { failAll(new Error("worker stopped")); markUnsupported(); };
  return w;
}

/** Gets the model ready, downloading it the first time. Safe to call more than once. */
export async function prepareAi(): Promise<boolean> {
  const plan = await getPlan();
  if (!plan) { setState("unsupported"); return false; }
  if (plan.tier === "builtin") { setState("ready"); return true; }
  loading ??= (async () => {
    const fromCache = await isAiReady();
    // Ask the browser to keep the model files rather than clearing them under storage pressure.
    if (!fromCache) await navigator.storage?.persist?.().catch(() => false);
    setState(fromCache ? "loading" : "downloading", fromCache ? null : { pct: 0, sizeMb: downloadSizeMb(plan) });
    try {
      worker = startWorker(plan, fromCache);
      await new Promise<void>((resolve, reject) => {
        loadWaiter = { resolve, reject };
        worker!.postMessage({ type: "load", model: plan.model!.id, device: plan.device, dtype: plan.dtype, fallbackDtype: "q4" });
      });
    } catch (e) {
      loading = null;
      if (state !== "unsupported") markUnsupported();
      throw e;
    }
  })();
  try { await loading; return true; } catch { return false; }
}

// --- Generation -------------------------------------------------------------------------------
const sessions = new Map<string, Promise<LmSession>>();
const exampleTurns = (o: GenerateOptions) => (o.examples ?? []).flatMap((e) => [{ role: "user", content: e.input }, { role: "assistant", content: e.output }]);
async function generateBuiltin(o: GenerateOptions): Promise<string> {
  const api = lmApi()!;
  const key = o.system + JSON.stringify(o.examples ?? []);
  if (!sessions.has(key)) {
    const init = { initialPrompts: [{ role: "system", content: o.system }, ...exampleTurns(o)] };
    sessions.set(key, api.create({ ...init, ...LM_LANG }).catch(() => api.create(init)));
  }
  const base = await sessions.get(key)!;
  // A fresh copy for each request, so one rewrite never colours the next.
  const session = base.clone ? await base.clone() : base;
  try {
    let full = "";
    for await (const chunk of session.promptStreaming(o.prompt)) {
      // Newer Chrome streams only the new piece; older versions repeat everything so far.
      const delta = full && chunk.startsWith(full) ? chunk.slice(full.length) : chunk;
      full = full && chunk.startsWith(full) ? chunk : full + chunk;
      o.onToken?.(delta, full);
    }
    return full;
  } finally {
    if (session !== base) session.destroy();
  }
}

/** Runs one request on the device and streams the reply. Throws if it can't; callers keep the original text. */
export async function generate(o: GenerateOptions): Promise<string> {
  const plan = await getPlan();
  if (!plan) { setState("unsupported"); throw new Error("unsupported"); }
  if (plan.tier === "builtin") {
    try { setState("ready"); return await generateBuiltin(o); } catch {
      // The built-in model can be withdrawn by the browser; carry on with the downloadable one.
      sessions.clear();
      planPromise = (async () => { const a = await gpuAdapter(); return { tier: "desktop" as const, model: MODELS.desktop, device: a ? "webgpu" as const : "wasm" as const, dtype: a?.features.has("shader-f16") ? "q4f16" as const : "q4" as const }; })();
      return generate(o);
    }
  }
  if (!(await prepareAi()) || !worker) throw new Error("unsupported");
  const id = ++jobSeq;
  const maxTokens = Math.min(o.maxTokens ?? plan.model!.maxTokens, plan.model!.maxTokens);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { jobs.delete(id); worker?.postMessage({ type: "stop" }); console.warn("[on-device AI] generation timed out"); reject(new Error("timeout")); }, GENERATE_TIMEOUT_MS);
    const finish = <T,>(fn: (v: T) => void) => (v: T) => { clearTimeout(timer); fn(v); };
    jobs.set(id, { resolve: finish(resolve), reject: finish(reject), onToken: o.onToken, full: "" });
    worker!.postMessage({ type: "generate", id, messages: [{ role: "system", content: o.system }, ...exampleTurns(o), { role: "user", content: o.prompt }], maxTokens, temperature: o.temperature ?? 0.3 });
  });
}

/** Frees the model's memory. The downloaded files stay cached, so the next use starts quickly. */
export function release(): void {
  sessions.forEach((s) => void s.then((x) => x.destroy()).catch(() => {}));
  sessions.clear();
  if (worker) {
    const w = worker;
    worker = null;
    try { w.postMessage({ type: "dispose" }); } catch { /* already gone */ }
    setTimeout(() => w.terminate(), 300);
  }
  loading = null;
  failAll(new Error("released"));
  if (state !== "unsupported") setState("idle");
}

// Phones reclaim memory aggressively; let go of the model as soon as the page is hidden for good.
if (typeof window !== "undefined") window.addEventListener("pagehide", release);
