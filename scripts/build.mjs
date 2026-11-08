// Build: apply database migrations when a database is connected, then build.
// Without a database (e.g. a first preview deploy) migrations are skipped so
// the site still builds and /setup can be used to generate keys.
import "dotenv/config";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.POSTGRES_URL_NON_POOLING && process.env.POSTGRES_PRISMA_URL) {
  run("npx prisma migrate deploy");
} else {
  console.warn("⚠ No database connected (POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING missing). Skipping migrations.\n  Add one in Vercel → Storage → Neon, then redeploy.");
}
run("npx prisma generate");
run("npx next build");
