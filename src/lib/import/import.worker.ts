// Smart Import Web Worker: reads pasted notes off the main thread so typing never stutters.
// Receives only the note and the user's own context from this device; never touches the network.
import { createIncrementalParser } from "./incremental";
import type { ParseContext } from "./parser";

const parse = createIncrementalParser();
let latest = 0;
let scheduled = false;
let job: { id: number; text: string; ctx: ParseContext } | null = null;

self.onmessage = (e: MessageEvent<{ id: number; text: string; ctx: ParseContext }>) => {
  latest = e.data.id;
  job = e.data;
  if (scheduled) return; // only the newest note is parsed; older requests are dropped
  scheduled = true;
  setTimeout(run, 0);
};

function run() {
  scheduled = false;
  const j = job;
  job = null;
  if (!j || j.id !== latest) return;
  const t0 = performance.now();
  const result = parse(j.text, j.ctx);
  (self as unknown as Worker).postMessage({ id: j.id, result, ms: performance.now() - t0 });
}
