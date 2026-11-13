"use client";

// Optional Tier 2: a small instruct model running fully on the device via
// WebGPU. Loaded lazily (dynamic import) so it never affects normal page loads.
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { acceptRewrite, splitSentences } from "./polish";
import { parseImportResponse, type ImportEntry } from "./schema";

// The 16-bit build is smaller and faster but needs the GPU's shader-f16 feature; devices without it get the 32-bit build.
export const MODEL_F16 = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const MODEL_F32 = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
let engine: Promise<MLCEngineInterface> | null = null;
let modelId: Promise<string> | null = null;

type GpuAdapter = { features: { has: (f: string) => boolean } };
const adapter = () => (navigator as unknown as { gpu?: { requestAdapter: () => Promise<GpuAdapter | null> } }).gpu?.requestAdapter() ?? Promise.resolve(null);

/** The model build this device can run. */
export function pickModelId(): Promise<string> {
  modelId ??= adapter().then((a) => (a?.features.has("shader-f16") ? MODEL_F16 : MODEL_F32)).catch(() => MODEL_F32);
  return modelId;
}

export async function webGpuAvailable(): Promise<boolean> {
  try {
    return !!(await adapter());
  } catch {
    return false;
  }
}

export async function isModelCached(): Promise<boolean> {
  try {
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    return await hasModelInCache(await pickModelId());
  } catch {
    return false;
  }
}

export async function deleteModel() {
  engine = null;
  const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
  for (const id of [MODEL_F16, MODEL_F32]) await deleteModelAllInfoInCache(id).catch(() => {});
}

export function loadEngine(onProgress: (pct: number, text: string) => void): Promise<MLCEngineInterface> {
  if (!engine) {
    engine = (async () => {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      const worker = new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" });
      return CreateWebWorkerMLCEngine(worker, await pickModelId(), { initProgressCallback: (r) => onProgress(Math.round(r.progress * 100), r.text) });
    })().catch((e) => {
      engine = null;
      throw e;
    });
  }
  return engine;
}

const SYSTEM = `You extract wellness log entries from short note snippets. Reply with JSON only: {"entries":[...]}.
Each entry has "kind" (one of: health, workout, meal, habit, journal), "date" (copy the snippet's date), "confidence" (0-1).
health: sleep_hours, sleep_quality (1-5), mood (1-5), energy (1-5), steps, weight {value, unit}, water {value, unit}.
workout: type (strength|cardio|mobility|sport|other), title, duration_min, distance {value, unit}.
meal: slot (breakfast|lunch|dinner|snack), name (what was eaten), calories, protein_g, carbs_g, fat_g.
habit: habit_name, completed (true/false).
journal: content (the person's words, lightly cleaned).
Only include facts that are written in the snippet. Never invent numbers.`;

/**
 * Reads only the snippets Tier 1 was unsure about. Output is validated with the
 * same Zod schema as everything else; dates are forced to the snippet's date and
 * confidence is capped so every AI field is highlighted for review. Any failure
 * returns null and Tier 1's results are kept.
 */
export async function enhanceSnippets(snippets: { text: string; date: string }[], onProgress: (pct: number, text: string) => void): Promise<ImportEntry[] | null> {
  if (!snippets.length) return [];
  try {
    const eng = await loadEngine(onProgress);
    const out: ImportEntry[] = [];
    for (const s of snippets.slice(0, 12)) {
      const res = await eng.chat.completions.create({
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Date: ${s.date}\nSnippet: ${s.text.slice(0, 400)}` }],
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
      });
      const parsed = parseImportResponse(res.choices[0]?.message?.content ?? "");
      if (!parsed.ok) continue;
      for (const e of parsed.entries) {
        out.push({ ...e, date: s.date, date_text: null, source_text: s.text, confidence: Math.min(e.confidence, 0.65), field_confidence: { ...e.field_confidence, ai: 0.6 } } as ImportEntry);
      }
    }
    return out;
  } catch {
    return null;
  }
}

export type PolishResult = { ok: true; text: string } | { ok: false; reason: "unavailable" | "changed" };

const POLISH_SYSTEM = "Rewrite this one sentence from a daily wellness summary so it sounds warm and natural. Keep every number exactly as written, using digits. Keep anything in quotation marks word for word. Do not add facts or advice. Reply with the rewritten sentence only.";

/**
 * Optional polish of the template brief, one sentence at a time. A sentence is replaced only when
 * its rewrite passes `acceptRewrite`; otherwise that sentence stays as written. If nothing could be
 * improved safely, the original brief is kept.
 */
export async function polishBrief(brief: string): Promise<PolishResult> {
  try {
    if (!(await isModelCached())) return { ok: false, reason: "unavailable" };
    const eng = await loadEngine(() => {});
    let changed = 0;
    const out: string[] = [];
    for (const sentence of splitSentences(brief).slice(0, 8)) {
      const res = await eng.chat.completions.create({
        messages: [{ role: "system", content: POLISH_SYSTEM }, { role: "user", content: sentence }],
        temperature: 0.4,
        max_tokens: 90,
      });
      const better = acceptRewrite(sentence, res.choices[0]?.message?.content ?? "");
      if (better) changed++;
      out.push(better ?? sentence);
    }
    return changed ? { ok: true, text: out.join(" ") } : { ok: false, reason: "changed" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
