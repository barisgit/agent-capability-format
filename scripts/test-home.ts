/**
 * Keeps every test run away from the real home directory.
 *
 * Bun reads the home directory once, when the process starts, so a test cannot redirect
 * `os.homedir()` by assigning `process.env.HOME`; the home has to be set before Bun starts.
 *
 * - Run as a script (each package's `test`), it starts `bun test` with its arguments in the
 *   current directory under a fresh throwaway HOME, with the Claude configuration and XDG base
 *   directories inside it, and removes that home afterwards. It passes the home it replaced in
 *   `CAPLET_REAL_HOME`, kept from an outer run, for the opt-in tests that must check the real
 *   home stays unchanged.
 * - Preloaded by each package's `bunfig.toml`, it stops a run that did not start that way, such as
 *   a direct `bun test`, before any test can read the real home.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedHomeEnv } from "./isolated-home.js";

/** Names the throwaway home of the run this script started. */
const MARKER = "CAPLET_TEST_HOME";
/** Names the home the run replaced; a nested run keeps the outer value. */
const REAL_HOME = "CAPLET_REAL_HOME";

function runIsolated(args: readonly string[]): number {
  const home = mkdtempSync(path.join(tmpdir(), "caplet-test-home-"));
  try {
    const result = spawnSync(process.execPath, ["test", ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        [MARKER]: home,
        [REAL_HOME]: process.env[REAL_HOME] || homedir(),
        ...isolatedHomeEnv(home),
      },
    });
    if (result.error !== undefined) throw result.error;
    return result.status ?? 1;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const entry = process.argv[1];
if (entry !== undefined && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  process.exit(runIsolated(process.argv.slice(2)));
} else if (process.env[MARKER] === undefined || homedir() !== process.env[MARKER]) {
  throw new Error(
    "Tests must not see the real home directory: run them with `bun run test [args]`, which starts `bun test` under a throwaway HOME (see scripts/test-home.ts).",
  );
}
