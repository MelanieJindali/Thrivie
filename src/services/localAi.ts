"use client";

// On-device AI for the daily brief rewrite and the Smart Import "Enhance" button.
// Everything runs in the browser: no cloud API, no server, and no text leaves the device.
//
// Three tiers, picked per device:
//   1. builtin  Desktop Chrome's built-in model (the Prompt API). Nothing to download.
//   2. desktop  Qwen2.5-0.5B-Instruct through Transformers.js in a Web Worker (WebGPU, or WebAssembly).
//   3. mobile   A smaller model for phones, tablets and low-memory devices, with shorter replies:
//               SmolLM2-135M-Instruct on iPhone and iPad (Safari closes tabs that use too much memory)
//               and on devices with 4 GB or less, SmolLM2-360M-Instruct on Android phones with more.
// If loading or running a model ever closes the tab, the next visit uses a smaller one, and after the
// smallest, on-device AI switches itself off on that device instead of crashing again.
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

type Dtype = "q4" | "q4f16" | "int8";
/** `gpu` is used with 16-bit GPU support, `cpu` everywhere else. Sizes are the model file in MB. */
type ModelSpec = { id: string; name: string; gpu: { dtype: Dtype; mb: number }; cpu: { dtype: Dtype; mb: number }; maxTokens: number };
export const MODELS = {
  // The ONNX build of Qwen/Qwen2.5-0.5B-Instruct (the original repository has no browser-ready files).
  desktop: { id: "onnx-community/Qwen2.5-0.5B-Instruct", name: "Qwen2.5 0.5B", gpu: { dtype: "q4f16", mb: 483 }, cpu: { dtype: "q4", mb: 786 }, maxTokens: 256 },
  mobile: { id: "HuggingFaceTB/SmolLM2-360M-Instruct", name: "SmolLM2 360M", gpu: { dtype: "q4f16", mb: 273 }, cpu: { dtype: "int8", mb: 365 }, maxTokens: 150 },
  tiny: { id: "HuggingFaceTB/SmolLM2-135M-Instruct", name: "SmolLM2 135M", gpu: { dtype: "q4f16", mb: 118 }, cpu: { dtype: "int8", mb: 137 }, maxTokens: 150 },
} satisfies Record<string, ModelSpec>;
/** The next smaller model to try after one closed the tab. */
const SMALLER: Record<string, ModelSpec | null> = { [MODELS.desktop.id]: MODELS.mobile, [MODELS.mobile.id]: MODELS.tiny, [MODELS.tiny.id]: null };
const CACHE = "transformers-cache";
const UNSUPPORTED_KEY = "thrivie-ai-unsupported";
// Crash guard. A tab the browser closes for using too much memory can't report anything, so the
// model in use is noted before heavy work and cleared after it (or when the page is left normally).
// A note still there on the next visit means that model closed the tab.
const BUSY_KEY = "thrivie-ai-busy";
const CRASHED_KEY = "thrivie-ai-crashed";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
function crashedModels(): string[] {
  const busy = store.get(BUSY_KEY);
  let list: string[] = [];
  try { list = JSON.parse(store.get(CRASHED_KEY) ?? "[]") as string[]; } catch { /* reset below */ }
  if (busy && !list.includes(busy)) { list.push(busy); store.set(CRASHED_KEY, JSON.stringify(list)); }
  store.del(BUSY_KEY);
  return list;
}
const markBusy = (id: string) => store.set(BUSY_KEY, id);
const clearBusy = () => store.del(BUSY_KEY);
const GENERATE_TIMEOUT_MS = 120_000;

type Plan = { tier: AiTier; model?: ModelSpec; device?: "webgpu" | "wasm"; dtype?: Dtype; fallbackDtype?: Dtype; sizeMb?: number };

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
type Nav = { userAgent: string; maxTouchPoints?: number; deviceMemory?: number };
export const isAppleMobile = (nav: Nav) => /iPhone|iPad|iPod/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1); // iPadOS reports as a Mac
export function isConstrainedDevice(nav: Nav = navigator as never): boolean {
  const mobileUa = /Android|Mobile|Silk|Opera Mini/i.test(nav.userAgent) || isAppleMobile(nav);
  return mobileUa || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4);
}
/** The largest model this kind of device should start with. */
export function startingModel(nav: Nav = navigator as never): ModelSpec {
  if (!isConstrainedDevice(nav)) return MODELS.desktop;
  // iOS gives a tab far less memory than the phone has, and Safari doesn't report it; Android reports up to 8 GB.
  if (isAppleMobile(nav) || !(typeof nav.deviceMemory === "number" && nav.deviceMemory >= 6)) return MODELS.tiny;
  return MODELS.mobile;
}
/** The model to use: the starting one, or the next smaller one for each that has closed the tab before. */
export function pickModel(nav: Nav, crashed: string[]): ModelSpec | null {
  let model: ModelSpec | null = startingModel(nav);
  while (model && crashed.includes(model.id)) model = SMALLER[model.id];
  return model;
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
    const model = pickModel(navigator as never, crashedModels());
    if (!model) return null; // even the smallest model closed the tab here
    const adapter = await gpuAdapter();
    const f16 = !!adapter?.features.has("shader-f16");
    // With 16-bit GPU support the smaller q4f16 files are used; everything else gets the CPU build.
    const build = adapter && f16 ? model.gpu : model.cpu;
    return { tier: model === MODELS.desktop ? "desktop" : "mobile", model, device: adapter ? "webgpu" : "wasm", dtype: build.dtype, fallbackDtype: model.cpu.dtype, sizeMb: build.mb };
  })();
  return planPromise;
}
export const downloadSizeMb = (p: Plan) => p.sizeMb ?? 0;

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
/** Removes every downloaded model file from this device, including the previous model's, and forgets earlier crashes so the next try starts fresh. */
export async function deleteAiDownloads(): Promise<void> {
  store.del(CRASHED_KEY);
  clearBusy();
  planPromise = null;
  release();
  await import("@/lib/legacyAiCleanup").then((m) => m.removeLegacyAiFiles()).catch(() => 0);
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
    // Files of a model this device no longer uses (a bigger one that closed the tab) are removed first.
    try {
      const cache = await caches.open(CACHE);
      for (const m of Object.values(MODELS)) if (m.id !== plan.model!.id) for (const r of await cachedModelFiles(m.id)) await cache.delete(r);
    } catch { /* nothing cached */ }
    const fromCache = await isAiReady();
    // Ask the browser to keep the model files rather than clearing them under storage pressure.
    if (!fromCache) await navigator.storage?.persist?.().catch(() => false);
    setState(fromCache ? "loading" : "downloading", fromCache ? null : { pct: 0, sizeMb: downloadSizeMb(plan) });
    try {
      worker = startWorker(plan, fromCache);
      markBusy(plan.model!.id);
      await new Promise<void>((resolve, reject) => {
        loadWaiter = { resolve, reject };
        worker!.postMessage({ type: "load", model: plan.model!.id, device: plan.device, dtype: plan.dtype, fallbackDtype: plan.fallbackDtype });
      });
      clearBusy();
    } catch (e) {
      clearBusy(); // it failed cleanly, which is different from closing the tab
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
      planPromise = (async () => {
        const a = await gpuAdapter();
        const build = a?.features.has("shader-f16") ? MODELS.desktop.gpu : MODELS.desktop.cpu;
        return { tier: "desktop" as const, model: MODELS.desktop, device: a ? "webgpu" as const : "wasm" as const, dtype: build.dtype, fallbackDtype: MODELS.desktop.cpu.dtype, sizeMb: build.mb };
      })();
      return generate(o);
    }
  }
  if (!(await prepareAi()) || !worker) throw new Error("unsupported");
  const id = ++jobSeq;
  const maxTokens = Math.min(o.maxTokens ?? plan.model!.maxTokens, plan.model!.maxTokens);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { jobs.delete(id); worker?.postMessage({ type: "stop" }); console.warn("[on-device AI] generation timed out"); reject(new Error("timeout")); }, GENERATE_TIMEOUT_MS);
    const finish = <T,>(fn: (v: T) => void) => (v: T) => { clearTimeout(timer); fn(v); };
    markBusy(plan.model!.id);
    const done = <T,>(fn: (v: T) => void) => (v: T) => { clearBusy(); fn(v); };
    jobs.set(id, { resolve: done(finish(resolve)), reject: done(finish(reject)), onToken: o.onToken, full: "" });
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
// Leaving the page normally is not a crash, so the busy note is cleared.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { clearBusy(); release(); });
