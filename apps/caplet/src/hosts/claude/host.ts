import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ClaudeCli, ClaudeCliOutcome } from "./cli.js";
import {
  type ClaudeCommand,
  claudeArgs,
  LIST_MARKETPLACES_ARGS,
  LIST_PLUGINS_ARGS,
} from "./commands.js";
import {
  type ClaudeInstalledPlugin,
  type ClaudeKnownMarketplace,
  type ClaudeSettingsFile,
  parseMarketplaceList,
  parsePluginList,
  parseSettingsMarketplaces,
} from "./state.js";

/**
 * Why a host call failed. `unavailable`: the CLI is missing or cannot start, so registration is
 * the user's to do. `policy-blocked`: managed settings refuse the marketplace or plugin.
 * `unreadable`: a list command printed output caplet cannot parse.
 */
export type ClaudeHostFailure =
  | { kind: "unavailable"; reason: "missing" | "failed-to-start"; message: string }
  | { kind: "policy-blocked"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "unreadable"; message: string };

export type ClaudeHostResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ClaudeHostFailure };

/**
 * Port to the Claude host's plugin system. Every state change goes through `run` with a typed
 * command whose scoped variants carry an explicit `--scope`; the list calls read host state.
 * Calls never throw for host failures; they return them.
 */
export interface ClaudeHost {
  /** Directory Claude resolves `project` and `local` scope from: the runner's working directory. */
  readonly projectDir: string;
  listPlugins(): Promise<ClaudeHostResult<ClaudeInstalledPlugin[]>>;
  listMarketplaces(): Promise<ClaudeHostResult<ClaudeKnownMarketplace[]>>;
  run(command: ClaudeCommand): Promise<ClaudeHostResult<undefined>>;
  /** The settings files `marketplace remove` edits from `projectDir`; a missing file declares nothing. */
  readSettings(): Promise<ClaudeSettingsFile[]>;
}

/**
 * The Claude host port over a `claude` runner (`execClaudeCli`, or a transcript fake in tests).
 * `projectDir` must be the runner's working directory and `configDir` Claude's configuration
 * directory (`CLAUDE_CONFIG_DIR`, else `~/.claude`), which holds the user settings.
 */
export function createClaudeHost(
  cli: ClaudeCli,
  location: { projectDir: string; configDir: string },
): ClaudeHost {
  async function list<T>(args: readonly string[], parse: (stdout: string) => T) {
    const outcome = await cli(args);
    if (outcome.kind !== "exited" || outcome.exitCode !== 0) return failed(outcome);
    try {
      return { ok: true as const, value: parse(outcome.stdout) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false as const, failure: { kind: "unreadable" as const, message } };
    }
  }
  return {
    projectDir: location.projectDir,
    listPlugins: () => list(LIST_PLUGINS_ARGS, parsePluginList),
    listMarketplaces: () => list(LIST_MARKETPLACES_ARGS, parseMarketplaceList),
    async run(command) {
      const outcome = await cli(claudeArgs(command));
      if (outcome.kind === "exited" && outcome.exitCode === 0)
        return { ok: true, value: undefined };
      return failed(outcome);
    },
    readSettings: () =>
      Promise.all([
        readSettingsFile("user", path.join(location.configDir, "settings.json")),
        readSettingsFile("project", path.join(location.projectDir, ".claude", "settings.json")),
        readSettingsFile("local", path.join(location.projectDir, ".claude", "settings.local.json")),
      ]),
  };
}

async function readSettingsFile(
  scope: ClaudeSettingsFile["scope"],
  file: string,
): Promise<ClaudeSettingsFile> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { scope, path: file, marketplaces: missing ? [] : undefined };
  }
  try {
    return { scope, path: file, marketplaces: parseSettingsMarketplaces(text) };
  } catch {
    return { scope, path: file, marketplaces: undefined };
  }
}

function failed(outcome: ClaudeCliOutcome): { ok: false; failure: ClaudeHostFailure } {
  switch (outcome.kind) {
    case "unavailable":
      return { ok: false, failure: outcome };
    case "terminated":
      return {
        ok: false,
        failure: { kind: "failed", message: `terminated by ${outcome.signal}` },
      };
    case "exited": {
      const text = `${outcome.stderr}\n${outcome.stdout}`;
      const message = `exit ${outcome.exitCode}: ${claudeMessage(outcome)}`;
      return { ok: false, failure: { kind: classifyClaudeFailure(text), message } };
    }
  }
}

/** Claude prints one `✘ ...` line on failure; prefer stderr, fall back to stdout. */
function claudeMessage(outcome: { stdout: string; stderr: string }): string {
  const lines = (stream: string) =>
    stream
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const line = lines(outcome.stderr).at(-1) ?? lines(outcome.stdout).at(-1) ?? "no output";
  return line.replace(/^✘\s*/, "");
}

// UNVERIFIED: Claude 2.1.97 could not be made to print a policy block without root-owned managed
// settings, so these are the message templates found as strings in the binary
// (research/plugin-interop/tools/claude-code.md, Runtime verification, "Policy block output").
// The exit code and surrounding text are unknown; an unmatched block is reported as a plain
// failure (`unknown` host state with Claude's message), never as a loose fallback.
const POLICY_BLOCK_PATTERNS: readonly RegExp[] = [
  /Marketplace source '.*' is blocked by enterprise policy/,
  /Marketplace '.*' is blocked by enterprise policy/,
  /Marketplace '.*' is not in the allowed marketplace list/,
  /Plugin ".*" is blocked by your organization's policy and cannot be installed/,
];

/** Whether a failed command's output matches a known Claude policy-block message. */
export function classifyClaudeFailure(output: string): "policy-blocked" | "failed" {
  return POLICY_BLOCK_PATTERNS.some((pattern) => pattern.test(output))
    ? "policy-blocked"
    : "failed";
}
