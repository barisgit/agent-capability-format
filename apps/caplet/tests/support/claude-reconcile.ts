/**
 * Shared fixture of the `reconcileClaudeHost` tests: a fresh temporary directory per test holding a
 * home with caplet's user marketplace directory, and the host port and fake Claude CLI over them.
 */
import { afterEach, beforeEach } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ClaudeCli } from "../../src/hosts/claude/cli.js";
import { createClaudeHost } from "../../src/hosts/claude/host.js";
import { type FakeTranscript, fakeClaudeCli } from "./fake-claude-cli";

// Live bindings: `useReconcileDirs` reassigns them before each test, and importers see the update.
/** The current test's temporary directory; Claude's project is `dir/project`. */
export let dir = "";
/** The current test's home, inside `dir`. */
export let home = "";
/** caplet's user-scope marketplace directory inside `home`. */
export let userDir = "";

/** Gives each test of the calling file a fresh `dir`, `home` and `userDir`, removed afterwards. */
export function useReconcileDirs(): void {
  beforeEach(async () => {
    dir = await realpath(await mkdtemp(path.join(tmpdir(), "caplet-claude-host-")));
    home = path.join(dir, "home");
    userDir = path.join(home, ".claude/.acf/marketplace");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
}

/** The host port over `cli`, with Claude resolving project and local scope from the test project. */
export function host(cli: ClaudeCli) {
  return createClaudeHost(cli, {
    projectDir: path.join(dir, "project"),
    configDir: path.join(home, ".claude"),
  });
}

/** The fake CLI replaying `transcripts` recorded at user scope, rewritten to this test's paths. */
export function userFake(transcripts: FakeTranscript[]) {
  return fakeClaudeCli({
    transcripts,
    replace: { "<HOME>": home, "<MARKETPLACE_DIR>": userDir, "spike-mkt": "acf-user" },
  });
}

/** The desired user-scope state with `plugins` in caplet's marketplace. */
export function userScope(plugins: { name: string; version: string }[]) {
  return [{ target: { scope: "user" as const }, marketplaceDir: userDir, plugins, recorded: true }];
}

/** Each recorded CLI call as one command line. */
export function commandLines(calls: string[][]): string[] {
  return calls.map((argv) => argv.join(" "));
}
