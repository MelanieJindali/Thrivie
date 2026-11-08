import path from "node:path";

/**
 * Where the database lives.
 *  - Production (free hosting): Turso – set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 *  - Local / self-hosted: a SQLite file from DATABASE_URL ("file:./thrivie.db",
 *    relative to the prisma/ folder, same as the Prisma CLI).
 */
export function libsqlConfig(): { url: string; authToken?: string } {
  const turso = process.env.TURSO_DATABASE_URL?.trim();
  if (turso) return { url: turso, authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined };
  const raw = process.env.DATABASE_URL?.trim() || "file:./thrivie.db";
  if (raw.startsWith("file:")) {
    const p = raw.slice("file:".length);
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), "prisma", p);
    return { url: `file:${abs}` };
  }
  return { url: raw };
}
