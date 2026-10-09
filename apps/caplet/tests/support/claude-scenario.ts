/**
 * Claude host scenarios for subprocess tests: shims whose recorded spike names (`probe`,
 * `local1`, `spike-mkt`, `acf-project-spike`, placeholders) are mapped to a test scope's own, and
 * the plugin versions apply would generate.
 */
import path from "node:path";
import type { Scope } from "@caplet/core";
import { claudeMarketplaceName, resolveClaudeScopeTarget } from "../../src/hosts/claude/scope.js";
import type { ClaudeScopeStatus } from "../../src/internal/claude-host-flow.js";
import { runCaplet, type TestScope } from "../helpers.js";
import { type ClaudeShim, claudeShim } from "./claude-path.js";
import type { FakeTranscript } from "./fake-claude-cli.js";

/** The recorded version every installed-plugin transcript reports. */
export const RECORDED_VERSION = "1.0.0+acf.aaa";

/** `fixture` with its recorded version replaced by `version`. */
export function atVersion(fixture: string, version: string, recorded = RECORDED_VERSION) {
  return { fixture, replace: { [recorded]: version } } satisfies FakeTranscript;
}

/** The marketplace directory of the scope's Claude install root. */
export function claudeMarketplaceDir(scope: TestScope, acfScope: Scope): string {
  const claudeRoot = acfScope === "user" ? scope.home : scope.cwd;
  return path.join(claudeRoot, ".claude", ".acf", "marketplace");
}

/** The marketplace name caplet uses for the scope (`acf-user` or `acf-project-<h>`). */
export async function claudeMarketplace(scope: TestScope, acfScope: Scope): Promise<string> {
  return claudeMarketplaceName(await resolveClaudeScopeTarget(acfScope, scope.cwd));
}

/**
 * A shim replaying `transcripts` for the scope: at user scope the spike's `probe@spike-mkt`
 * becomes `<plugin>@acf-user`; at project scope `local1@acf-project-spike` becomes
 * `<plugin>@acf-project-<h>`.
 */
export async function claudeScenarioShim(
  scope: TestScope,
  acfScope: Scope,
  plugin: string,
  transcripts: FakeTranscript[],
): Promise<ClaudeShim> {
  const marketplace = await claudeMarketplace(scope, acfScope);
  const names =
    acfScope === "user"
      ? { probe: plugin, "spike-mkt": marketplace }
      : { local1: plugin, "acf-project-spike": marketplace, "spike-mkt": marketplace };
  return await claudeShim(scope.dir, {
    transcripts,
    replace: {
      "<HOME>": scope.home,
      "<PROJECT>": scope.cwd,
      "<MARKETPLACE_DIR>": claudeMarketplaceDir(scope, acfScope),
      ...names,
    },
  });
}

/**
 * `claude plugin list --json` with only `<plugin>` installed at Claude local scope for the
 * project: the recorded project-and-local listing, whose project-scope entry is renamed into a
 * marketplace caplet does not own.
 */
export function localPluginList(version: string): FakeTranscript {
  return {
    fixture: "list-json-project-and-local",
    replace: { [RECORDED_VERSION]: version, "probe@acf-project-spike": "probe@team-mkt" },
  };
}

/** The Claude plugins a dry run without the CLI plans for `args` (`apply` flags). */
export async function plannedClaude(
  scope: TestScope,
  args: readonly string[],
): Promise<ClaudeScopeStatus[]> {
  const result = await runCaplet(scope, ["apply", ...args, "--dry-run", "--json"]);
  return (JSON.parse(result.stdout) as { claude?: ClaudeScopeStatus[] }).claude ?? [];
}

/** The `+acf.<d>` version apply would generate now for `plugin`. */
export async function plannedVersion(
  scope: TestScope,
  args: readonly string[],
  plugin: string,
): Promise<string> {
  const planned = await plannedClaude(scope, args);
  const version = planned
    .flatMap((item) => item.plugins)
    .find((item) => item.name === plugin)?.desiredVersion;
  if (version === undefined) throw new Error(`apply plans no Claude plugin ${plugin}`);
  return version;
}
