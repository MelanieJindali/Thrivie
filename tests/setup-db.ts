// Vitest global setup: apply migrations to the dedicated TEST database and
// empty its tables. Refuses to run against any database not named *_test.
import { execSync } from "node:child_process";
import { Client } from "pg";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || "postgresql://thrivie_owner:devpass@localhost:5432/thrivie_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`Refusing to run tests against "${dbName}" (name must end in _test).`);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, POSTGRES_PRISMA_URL: url, POSTGRES_URL_NON_POOLING: url } });
  const c = new Client({ connectionString: url });
  await c.connect();
  const { rows } = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  if (rows.length) await c.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
  await c.end();
}
