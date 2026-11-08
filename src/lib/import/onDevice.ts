"use client";

// Optional Tier 2: a small instruct model running fully on the device via
// WebGPU. Loaded lazily (dynamic import) so it never affects normal page loads.
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { parseImportResponse, type ImportEntry } from "./schema";

export const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
let engine: Promise<MLCEngineInterface> | null = null;

export async function webGpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

export async function isModelCached(): Promise<boolean> {
  try {
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    return await hasModelInCache(MODEL_ID);
  } catch {
    return false;
  }
}

export async function deleteModel() {
  engine = null;
  const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
  await deleteModelAllInfoInCache(MODEL_ID);
}

export function loadEngine(onProgress: (pct: number, text: string) => void): Promise<MLCEngineInterface> {
  if (!engine) {
    engine = (async () => {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      const worker = new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" });
      return CreateWebWorkerMLCEngine(worker, MODEL_ID, { initProgressCallback: (r) => onProgress(Math.round(r.progress * 100), r.text) });
    })().catch((e) => {
      engine = null;
      throw e;
    });
  }
  return engine;
}

const SYSTEM = `You extract wellness log entries from short note snippets. Reply with JSON only: {"entries":[...]}.
Each entry has "kind" (one of: health, workout, habit, journal), "date" (copy the snippet's date), "confidence" (0-1).
health: sleep_hours, sleep_quality (1-5), mood (1-5), energy (1-5), steps, weight {value, unit}, water {value, unit}.
workout: type (strength|cardio|mobility|sport|other), title, duration_min, distance {value, unit}.
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

/** Optional polish of the template brief. Rejected unless every number is kept and no weight/medical language appears. */
export async function polishBrief(brief: string): Promise<string | null> {
  try {
    if (!(await isModelCached())) return null;
    const eng = await loadEngine(() => {});
    const res = await eng.chat.completions.create({
      messages: [
        { role: "system", content: "Rewrite the user's daily wellness summary to sound warm and natural in 3-5 short sentences. Keep every number exactly. Do not add facts, advice about weight, food or medicine. Reply with the rewritten text only." },
        { role: "user", content: brief },
      ],
      temperature: 0.4,
      max_tokens: 220,
    });
    const out = (res.choices[0]?.message?.content ?? "").replace(/\s+/g, " ").trim();
    const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");
    if (!out || out.length > 700 || nums(out) !== nums(brief) || /weight|calori|diet|doctor|diagnos|medic/i.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}
