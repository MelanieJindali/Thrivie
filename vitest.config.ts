import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DB = process.env.TEST_DATABASE_URL || "postgresql://thrivie_owner:devpass@localhost:5432/thrivie_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup-db.ts"],
    env: { POSTGRES_PRISMA_URL: TEST_DB, POSTGRES_URL_NON_POOLING: TEST_DB },
    fileParallelism: false,
  },
});
