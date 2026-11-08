// Safe error logging. Error messages from the database layer can echo the
// values that were being written (health data, journal text), so we only ever
// log the error's type and code, never its message or the request data.
export function logError(context: string, e: unknown) {
  const err = e as { name?: string; code?: string; statusCode?: number };
  console.error(`[thrivie] ${context}: ${err?.name ?? "Error"}${err?.code ? ` (${err.code})` : ""}${err?.statusCode ? ` [${err.statusCode}]` : ""}`);
}
