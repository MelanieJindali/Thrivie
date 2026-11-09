// Points git at the repo's .githooks folder so the secret-blocking pre-commit hook runs
// in every clone. Runs on `npm install`; does nothing where there is no git (e.g. CI builds).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".git")) {
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  } catch {
    // git not installed; nothing to do
  }
}
