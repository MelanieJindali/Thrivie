"use client";

import { useEffect, useRef, useState } from "react";
import type { ParseContext, ParseOutput } from "./parser";
import { createIncrementalParser } from "./incremental";

/**
 * Parses notes in a Web Worker, 250 ms after typing stops, and ignores out-of-date results.
 * Falls back to parsing on the main thread if Workers aren't available.
 */
export function useImportParser(text: string, ctx: ParseContext, delay = 250) {
  const [result, setResult] = useState<ParseOutput | null>(null);
  const [pending, setPending] = useState(false);
  const worker = useRef<Worker | null>(null);
  const fallback = useRef<ReturnType<typeof createIncrementalParser> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    try {
      worker.current = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
      worker.current.onmessage = (e: MessageEvent<{ id: number; result: ParseOutput }>) => {
        if (e.data.id !== seq.current) return; // a newer edit is on its way
        setResult(e.data.result);
        setPending(false);
      };
      worker.current.onerror = () => { worker.current?.terminate(); worker.current = null; };
    } catch {
      worker.current = null;
    }
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    const id = ++seq.current;
    if (!text.trim()) { setResult(null); setPending(false); return; }
    setPending(true);
    // Pastes and the first character parse immediately; typing waits for a pause.
    const t = setTimeout(() => {
      if (worker.current) worker.current.postMessage({ id, text, ctx });
      else {
        fallback.current ??= createIncrementalParser();
        if (id === seq.current) { setResult(fallback.current(text, ctx)); setPending(false); }
      }
    }, result ? delay : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ctx, delay]);

  return { parsed: text.trim() ? result : null, pending };
}
