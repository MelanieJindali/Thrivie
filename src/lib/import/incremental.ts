// Parses a note day by day and caches each day's result, so editing one day of a
// long note only re-reads that day. Pure; used by the import Web Worker (and as a fallback).
// Gives exactly the same output as parseNotes: both share segmentByDay, parseSegments and finishParse.
import { finishParse, parseSegments, segmentByDay, type ParseContext, type ParseOutput, type SegmentResult } from "./parser";
import { cleanText } from "./cleanText";

const MAX_CACHE = 400;

export function createIncrementalParser() {
  let ctxKey = "";
  const cache = new Map<string, SegmentResult>();
  return function parse(text: string, ctx: ParseContext): ParseOutput {
    const key = JSON.stringify(ctx);
    if (key !== ctxKey) { cache.clear(); ctxKey = key; }
    const segs = segmentByDay(cleanText(text.slice(0, 20000)), ctx.today);
    const parts = segs.map((s) => {
      const k = JSON.stringify(s);
      let r = cache.get(k);
      if (!r) {
        r = parseSegments([s], ctx);
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
        cache.set(k, r);
      } else {
        // Re-use: refresh LRU order.
        cache.delete(k); cache.set(k, r);
      }
      return r;
    });
    return finishParse(parts, ctx, segs.length);
  };
}
