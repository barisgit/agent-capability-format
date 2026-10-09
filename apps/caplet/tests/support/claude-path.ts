import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ShimCall } from "./claude-shim.js";
import { type FakeClaudeCliOptions, loadTranscripts } from "./fake-claude-cli.js";

/**
 * `PATH` without any directory that holds a `claude` program, so caplet subprocesses never reach
 * the developer's real Claude Code (and its `~/.claude`); for them the CLI is missing.
 */
export function pathWithoutClaude(pathValue = process.env.PATH ?? ""): string {
  return pathValue
    .split(path.delimiter)
    .filter((dir) => dir !== "" && !existsSync(path.join(dir, "claude")))
    .join(path.delimiter);
}

export type ClaudeShim = {
  /** Environment for `runCaplet`: `PATH` with the shim first and the scenario file. */
  env: Record<string, string>;
  /** Every invocation so far, as `claude ...` lines, in order. */
  calls(): Promise<string[]>;
  /** Working directory of every invocation so far, in order. */
  cwds(): Promise<string[]>;
  /** Fixture names of the scenario not replayed yet. */
  unused(): Promise<string[]>;
  /** Invocations that had no transcript (the shim failed them with exit 99). */
  unexpected(): Promise<string[]>;
};

/**
 * Installs a `claude` shim under `dir` that replays `options` like `fakeClaudeCli`, for tests
 * that run caplet as a subprocess. Each call to `claudeShim` starts a new scenario; transcripts
 * replay at most once across all invocations of the scenario.
 */
export async function claudeShim(dir: string, options: FakeClaudeCliOptions): Promise<ClaudeShim> {
  const bin = path.join(dir, "claude-shim-bin");
  await mkdir(bin, { recursive: true });
  const scenario = path.join(dir, `claude-scenario-${Date.now()}-${Math.random()}.json`);
  await writeFile(scenario, JSON.stringify(options), "utf8");
  const program = path.join(bin, "claude");
  const script = path.join(import.meta.dir, "claude-shim.ts");
  await writeFile(program, `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`, "utf8");
  await chmod(program, 0o755);
  const log = async (): Promise<ShimCall[]> => {
    const text = await readFile(`${scenario}.calls.jsonl`, "utf8").catch(() => "");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ShimCall);
  };
  return {
    env: {
      PATH: [bin, pathWithoutClaude()].join(path.delimiter),
      CAPLET_FAKE_CLAUDE: scenario,
    },
    calls: async () => (await log()).map((call) => call.argv.join(" ")),
    cwds: async () => (await log()).map((call) => call.cwd),
    unused: async () => {
      const used = new Set((await log()).map((call) => call.index));
      return loadTranscripts(options)
        .filter((entry) => !used.has(entry.index))
        .map((entry) => entry.fixture);
    },
    unexpected: async () =>
      (await log()).filter((call) => call.error !== undefined).map((call) => call.argv.join(" ")),
  };
}
