// Loaded only when Enhance runs, so the note reader stays out of the Import page's startup code.
import { parseNotes, type ParseContext } from "./parser";

/** True when the note reader turns this line into an entry with nothing left over. */
export function readsAsEntry(line: string, ctx: ParseContext): boolean {
  const r = parseNotes(`Mon - ${line}`, ctx);
  return r.entries.length > 0 && r.unparsed.length === 0;
}
