/* Applies prisma/migrations/*.sql in order to the configured database
 * (local SQLite file or Turso). Safe to run repeatedly.
 *   npm run db:migrate
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { libsqlConfig } from "../src/lib/dbConfig";

async function main() {
  if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
    console.error("TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel → Settings → Environment Variables, then redeploy.");
    process.exit(1);
  }
  const cfg = libsqlConfig();
  const db = createClient(cfg);
  console.log(`Migrating ${cfg.url.startsWith("file:") ? cfg.url : cfg.url.replace(/\/\/([^.]+)/, "//***")}`);
  await db.execute(`CREATE TABLE IF NOT EXISTS "_thrivie_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`);
  const applied = new Set((await db.execute(`SELECT name FROM "_thrivie_migrations"`)).rows.map((r) => String(r.name)));

  // A database created by an older single-user version has tables but no migration history.
  if (!applied.size) {
    const legacy = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='HealthLog'`);
    if (legacy.rows.length) {
      console.error("This database was created by an older (single-user) Thrivie version.\nExport a JSON backup from Settings first if you need it, then run `npm run db:reset`.");
      process.exit(1);
    }
  }

  const dir = path.join(process.cwd(), "prisma", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;
  for (const f of files) {
    const name = f.replace(/\.sql$/, "");
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await db.executeMultiple(`BEGIN;\n${sql}\nINSERT INTO "_thrivie_migrations" ("name", "appliedAt") VALUES ('${name}', '${new Date().toISOString()}');\nCOMMIT;`);
    console.log(`  applied ${name}`);
    count++;
  }
  console.log(count ? `Done (${count} migration${count === 1 ? "" : "s"}).` : "Already up to date.");
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
