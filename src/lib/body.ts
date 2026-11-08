import "server-only";

/**
 * Read a JSON body with a hard size limit (checked before and while reading),
 * so oversized requests can't exhaust memory. Returns undefined if too large
 * or not valid JSON.
 */
export async function readJson(req: Request, maxBytes: number): Promise<unknown | undefined> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return undefined;
  const reader = req.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

export const tooLarge = (limit: string) => Response.json({ error: `Request is too large or malformed (limit ${limit}).` }, { status: 413 });
