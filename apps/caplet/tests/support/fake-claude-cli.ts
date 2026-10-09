import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClaudeCli, ClaudeCliOutcome } from "../../src/hosts/claude/cli.js";

/**
 * A transcript from task 5.1 (`tests/fixtures/claude-cli/<fixture>.json`), optionally with
 * replacements that apply to this transcript only.
 */
export type FakeTranscript = string | { fixture: string; replace?: Record<string, string> };

export type FakeClaudeCliOptions = {
  /** Transcripts the fake may replay, each at most once, in the order given when argv repeats. */
  transcripts: FakeTranscript[];
  /**
   * Literal replacements applied to argv, stdout and stderr, longest key first: the placeholders
   * `<HOME>`, `<PROJECT>`, `<MARKETPLACE_DIR>` and `<SPIKE_ROOT>`, and the spike's plugin and
   * marketplace names (`probe`, `spike-mkt`, `acf-project-spike`, ...), because caplet derives
   * its own marketplace names.
   */
  replace?: Record<string, string>;
};

export type FakeClaudeCli = {
  cli: ClaudeCli;
  /** Every invocation, as `claude ...` argv. */
  calls: string[][];
  /** Fixture names not replayed yet. */
  unused(): string[];
};

/** One replayable transcript after substitution; `index` is its position in the options. */
export type ReplayEntry = {
  index: number;
  fixture: string;
  argv: string[];
  outcome: Extract<ClaudeCliOutcome, { kind: "exited" }>;
};

type Transcript = { argv: string[]; exitCode: number; stdout: string; stderr: string };

const FIXTURES = path.join(import.meta.dir, "../fixtures/claude-cli");

/**
 * The transcripts of `options` with their replacements applied. This and {@link takeTranscript}
 * are the one replay implementation, shared by the in-process fake and the `claude` shim that
 * subprocess tests put on `PATH` (`claude-shim.ts`).
 */
export function loadTranscripts(options: FakeClaudeCliOptions): ReplayEntry[] {
  return options.transcripts.map((entry, index) => {
    const { fixture, replace = {} } = typeof entry === "string" ? { fixture: entry } : entry;
    const raw = JSON.parse(
      readFileSync(path.join(FIXTURES, `${fixture}.json`), "utf8"),
    ) as Transcript;
    const substitute = replacer({ ...options.replace, ...replace });
    return {
      index,
      fixture,
      argv: raw.argv.map(substitute),
      outcome: {
        kind: "exited",
        exitCode: raw.exitCode,
        stdout: substitute(raw.stdout),
        stderr: substitute(raw.stderr),
      },
    };
  });
}

/**
 * Removes and returns the first entry of `pending` recorded for `argv` (`claude ...`). Throws
 * when there is none, so a test cannot pass on a command the real CLI was never observed to
 * accept.
 */
export function takeTranscript(pending: ReplayEntry[], argv: readonly string[]): ReplayEntry {
  const index = pending.findIndex((t) => sameArgv(t.argv, argv));
  const match = pending[index];
  if (match === undefined) {
    const available = pending.map((t) => `${t.fixture}: ${t.argv.join(" ")}`).join("; ");
    throw new Error(`fake claude: no transcript for \`${argv.join(" ")}\` (unused: ${available})`);
  }
  pending.splice(index, 1);
  return match;
}

/** A `claude` runner that replays recorded Claude 2.1.97 transcripts in process. */
export function fakeClaudeCli(options: FakeClaudeCliOptions): FakeClaudeCli {
  const pending = loadTranscripts(options);
  const calls: string[][] = [];
  return {
    calls,
    unused: () => pending.map((t) => t.fixture),
    cli: async (args) => {
      const argv = ["claude", ...args];
      calls.push(argv);
      return takeTranscript(pending, argv).outcome;
    },
  };
}

/** A runner for a machine without `claude` on `PATH` (spawn fails with ENOENT). */
export function missingClaudeCli(): ClaudeCli {
  return async () => ({ kind: "unavailable", reason: "missing", message: "spawn claude ENOENT" });
}

function replacer(replace: Record<string, string>): (text: string) => string {
  const pairs = Object.entries(replace).sort(([a], [b]) => b.length - a.length);
  return (text) => pairs.reduce((out, [from, to]) => out.replaceAll(from, to), text);
}

function sameArgv(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((arg, i) => arg === b[i]);
}
