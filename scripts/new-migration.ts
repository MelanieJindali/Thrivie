/* Creates the next migration from the difference between the local database
 * and prisma/schema.prisma.  Usage: npm run db:new-migration add_something
 * (Your local DB must be up to date: run `npm run db:migrate` first.) */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { libsqlConfig } from "../src/lib/dbConfig";

const name = (process.argv[2] || "change").replace(/[^a-z0-9_]/gi, "_");
const cfg = libsqlConfig();
if (!cfg.url.startsWith("file:")) throw new Error("Run this against a local database (unset TURSO_DATABASE_URL).");
const dir = path.join(process.cwd(), "prisma", "migrations");
const next = String(fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).length + 1).padStart(4, "0");
const sql = execSync(`npx prisma migrate diff --from-url "${cfg.url}" --to-schema-datamodel prisma/schema.prisma --script`, { encoding: "utf8" });
// Ignore our own migration-tracking table, which isn't in the Prisma schema.
const cleaned = sql
  .split(/\n(?=-- )/)
  .filter((block) => !block.includes("_thrivie_migrations"))
  .join("\n")
  .trim();
if (/empty migration/i.test(cleaned) || !cleaned) {
  console.log("No schema changes.");
} else {
  const file = path.join(dir, `${next}_${name}.sql`);
  fs.writeFileSync(file, cleaned + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), file)} — apply it with npm run db:migrate`);
}
