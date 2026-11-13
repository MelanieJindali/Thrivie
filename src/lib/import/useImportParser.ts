"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ParseContext, ParseOutput } from "./parser";
import type { createIncrementalParser } from "./incremental";

type Job = { id: number; text: string; ctx: ParseContext };
const WORKER_TIMEOUT_MS = 4000;

/**
 * Parses notes in a Web Worker, 250 ms after typing stops, and ignores out-of-date results.
 * If the worker can't start, fails, or stays silent, the same parser runs on the main thread instead,
 * so notes are always read. `failed` is true only when even that can't read them.
 */
export function useImportParser(text: string, ctx: ParseContext, delay = 250) {
  const [result, setResult] = useState<ParseOutput | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const worker = useRef<Worker | null>(null);
  const fallback = useRef<ReturnType<typeof createIncrementalParser> | null>(null);
  const seq = useRef(0);
  const latest = useRef<Job | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWatchdog = () => { if (watchdog.current) clearTimeout(watchdog.current); watchdog.current = null; };

  /** Reads on the main thread. The parser is loaded only when it's needed, so it stays out of the page's startup code. */
  const readHere = useCallback((job: Job) => {
    import("./incremental")
      .then(({ createIncrementalParser }) => {
        fallback.current ??= createIncrementalParser();
        if (job.id !== seq.current) return;
        try { setResult(fallback.current(job.text, job.ctx)); setFailed(false); } catch { setFailed(true); }
        setPending(false);
      })
      .catch(() => { if (job.id === seq.current) { setFailed(true); setPending(false); } });
  }, []);

  const giveUpOnWorker = useCallback(() => {
    stopWatchdog();
    worker.current?.terminate();
    worker.current = null;
    if (latest.current && latest.current.id === seq.current) readHere(latest.current);
  }, [readHere]);

  useEffect(() => {
    try {
      const w = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; result: ParseOutput }>) => {
        if (e.data.id !== seq.current) return; // a newer edit is on its way
        stopWatchdog();
        setResult(e.data.result);
        setFailed(false);
        setPending(false);
      };
      w.onerror = giveUpOnWorker;
      w.onmessageerror = giveUpOnWorker;
      worker.current = w;
    } catch {
      worker.current = null;
    }
    return () => { stopWatchdog(); worker.current?.terminate(); worker.current = null; };
  }, [giveUpOnWorker]);

  useEffect(() => {
    const id = ++seq.current;
    stopWatchdog();
    if (!text.trim()) { setResult(null); setPending(false); setFailed(false); return; }
    setPending(true);
    setFailed(false);
    // Pastes and the first character parse immediately; typing waits for a pause.
    const t = setTimeout(() => {
      const job: Job = { id, text, ctx };
      latest.current = job;
      if (!worker.current) return readHere(job);
      try {
        worker.current.postMessage(job);
        watchdog.current = setTimeout(() => { if (seq.current === id) giveUpOnWorker(); }, WORKER_TIMEOUT_MS);
      } catch {
        giveUpOnWorker();
      }
    }, result ? delay : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ctx, delay, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { parsed: text.trim() && !failed ? result : null, pending, failed, retry };
}
