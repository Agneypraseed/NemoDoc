import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Playwright owns the isolated server; this runner owns only its generated storage.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-verify-"));
const environment = {
  ...process.env,
  NEMODOC_VERIFY_DATA_DIR: directory,
  DOTENV_CONFIG_PATH: path.join(directory, "disabled.env"),
  NEBIUS_API_KEY: "",
  NVIDIA_API_KEY: "",
  DATABASE_URL: "",
  AGENT_READ_DATABASE_URL: "",
};
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
try {
  if (!process.env.npm_execpath)
    throw new Error("Run this helper with npm run verify:agents.");
  const built = await run([process.env.npm_execpath, "run", "build"]);
  process.exitCode =
    built ||
    (await run([
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.verification.config.ts",
      ...process.argv.slice(2),
    ]));
} finally {
  const resolved = path.resolve(directory);
  if (
    path.dirname(resolved) !== path.resolve(tmpdir()) ||
    !path.basename(resolved).startsWith("nemodoc-verify-")
  )
    throw new Error("Refusing to clean an unexpected verification directory.");
  rmSync(resolved, { recursive: true, force: true });
}
