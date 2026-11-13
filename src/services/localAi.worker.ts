// Web Worker that runs the on-device language model (Transformers.js), so the page never freezes.
// It receives only short pieces of text from this device and never sends them anywhere. The only
// network requests it makes are downloads of the model's own files, which are then kept in the
// browser's cache for offline use.
import { env, pipeline, TextStreamer, InterruptableStoppingCriteria, type TextGenerationPipeline } from "@huggingface/transformers";

type Device = "webgpu" | "wasm";
type LoadMsg = { type: "load"; model: string; device: Device; dtype: string; fallbackDtype: string };
type GenMsg = { type: "generate"; id: number; messages: { role: string; content: string }[]; maxTokens: number; temperature: number };
type InMsg = LoadMsg | GenMsg | { type: "stop" } | { type: "dispose" };

env.allowLocalModels = false;
env.useBrowserCache = true;

/** The runtime files are served by Thrivie itself (public/vendor/ort), never from a third-party CDN. */
function useOwnRuntime(device: Device) {
  const suffix = device === "webgpu" ? ".asyncify" : "";
  const base = `${self.location.origin}/vendor/ort/ort-wasm-simd-threaded${suffix}`;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; wasmBinary?: unknown } };
  if (onnx.wasm) { onnx.wasm.wasmPaths = { mjs: `${base}.mjs`, wasm: `${base}.wasm` }; onnx.wasm.wasmBinary = undefined; }
}

let generator: TextGenerationPipeline | null = null;
const stopper = new InterruptableStoppingCriteria();
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

async function load(m: LoadMsg) {
  const files = new Map<string, { loaded: number; total: number }>();
  const progress = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    post({ type: "progress", loaded, total });
  };
  const open = async (device: Device, dtype: string) => {
    useOwnRuntime(device);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await pipeline("text-generation", m.model, { device, dtype: dtype as any, progress_callback: progress as any })) as TextGenerationPipeline;
  };
  try {
    generator = await open(m.device, m.dtype);
    post({ type: "ready", device: m.device, dtype: m.dtype });
  } catch (first) {
    if (m.device !== "webgpu") throw first;
    // The GPU path can fail on older drivers; the CPU path works everywhere WebAssembly does.
    files.clear();
    generator = await open("wasm", m.fallbackDtype);
    post({ type: "ready", device: "wasm", dtype: m.fallbackDtype });
  }
}

async function generate(m: GenMsg) {
  if (!generator) throw new Error("not loaded");
  stopper.reset();
  let text = "";
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t: string) => { text += t; post({ type: "token", id: m.id, delta: t }); },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await generator(m.messages as any, {
    max_new_tokens: m.maxTokens,
    do_sample: m.temperature > 0,
    ...(m.temperature > 0 ? { temperature: m.temperature, top_p: 0.9 } : {}),
    repetition_penalty: 1.1,
    streamer,
    stopping_criteria: stopper,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  post({ type: "done", id: m.id, text });
}

let chain = Promise.resolve();
self.onmessage = (e: MessageEvent<InMsg>) => {
  const m = e.data;
  if (m.type === "stop") { stopper.interrupt(); return; }
  if (m.type === "dispose") {
    stopper.interrupt();
    chain = chain.then(async () => { try { await generator?.dispose(); } catch { /* already gone */ } generator = null; post({ type: "disposed" }); });
    return;
  }
  // One job at a time: a phone has no memory to spare for two.
  chain = chain.then(async () => {
    try {
      if (m.type === "load") await load(m);
      else await generate(m);
    } catch (err) {
      post({ type: "error", id: m.type === "generate" ? m.id : undefined, stage: m.type, message: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  });
};
