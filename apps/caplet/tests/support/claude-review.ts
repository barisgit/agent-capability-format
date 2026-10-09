/**
 * Shared fixture of the Claude host command tests: capability `review` (a skill and an HTTP
 * server) selected in a test scope, and `caplet apply` at user scope with the claude carrier.
 */
import { expect } from "bun:test";
import path from "node:path";
import type { Diagnostic } from "@caplet/core";
import type { ClaudeScopeStatus } from "../../src/internal/claude-host-flow.js";
import {
  cleanup,
  makeScope,
  type RunResult,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers.js";
import { claudeMarketplaceDir, claudeScenarioShim, plannedVersion } from "./claude-scenario.js";
import type { FakeTranscript } from "./fake-claude-cli.js";

const scopes: TestScope[] = [];

/** Removes every scope `reviewScope` made; register it with `afterEach`. */
export async function cleanupReviewScopes(): Promise<void> {
  await Promise.all(scopes.splice(0).map(cleanup));
}

/** The capability, and the plugin caplet generates from it. */
export const NAME = "review";
/** The command that registers the plugin at user scope. */
export const INSTALL = `claude plugin install ${NAME}@acf-user --scope user`;
/** The two state reads that open every reconcile. */
export const READ = ["claude plugin list --json", "claude plugin marketplace list --json"];

/** The parts of `caplet apply --json` these tests check. */
export type ApplyJson = { ok: boolean; diagnostics: Diagnostic[]; claude?: ClaudeScopeStatus[] };

/** Writes capability `review` (a skill and an HTTP server) and selects it in the scope. */
export async function reviewScope(acfScope: "user" | "project"): Promise<TestScope> {
  const scope = await makeScope();
  scopes.push(scope);
  const source = path.join(scope.sourceRoot, NAME);
  await writeText(
    path.join(source, "acf.yml"),
    `acf: 1\nname: ${NAME}\nversion: 1.0.0\ndescription: Review changes\n`,
  );
  await writeSkill(scope, "Read the diff first.");
  await writeText(
    path.join(source, "mcp", "mcp.yml"),
    "servers:\n  - name: diff\n    transport: http\n    url: https://mcp.example.com/diff\n",
  );
  const agents = acfScope === "user" ? path.join(scope.home, ".agents") : scope.agentsDir;
  await writeText(path.join(agents, "caplet.yml"), "targets:\n  claude:\n    carrier: plugin\n");
  await selectReview(scope, agents, true);
  return scope;
}

/** Replaces the body of the capability's skill. */
export async function writeSkill(scope: TestScope, body: string): Promise<void> {
  await writeText(
    path.join(scope.sourceRoot, NAME, "skills", NAME, "SKILL.md"),
    `---\nname: ${NAME}\ndescription: Review a change\n---\n${body}\n`,
  );
}

/** Selects the capability in `agents/capabilities.yml`, or leaves nothing selected. */
export async function selectReview(
  scope: TestScope,
  agents: string,
  selected: boolean,
): Promise<void> {
  const entries = selected ? `\n  - source: path:${path.join(scope.sourceRoot, NAME)}\n` : " []\n";
  await writeText(path.join(agents, "capabilities.yml"), `acf: 1\ncapabilities:${entries}`);
}

/** Command arguments for user scope with only the claude target. */
export function userArgs(scope: TestScope): string[] {
  return ["--cwd", scope.cwd, "--scope", "user", "--target", "claude"];
}

/** The plugin's directory in caplet's user marketplace. */
export function pluginDir(scope: TestScope): string {
  return path.join(claudeMarketplaceDir(scope, "user"), "plugins", NAME);
}

/** The command that registers caplet's user marketplace. */
export function addMarketplace(scope: TestScope): string {
  return `claude plugin marketplace add ${claudeMarketplaceDir(scope, "user")} --scope user`;
}

/** Runs `caplet apply` at user scope with `extra` arguments. */
export async function apply(
  scope: TestScope,
  env: Record<string, string> = {},
  extra: string[] = [],
): Promise<RunResult> {
  return await runCaplet(scope, ["apply", ...userArgs(scope), ...extra], env);
}

/** Runs `caplet apply --json` at user scope and parses its output. */
export async function applyJson(
  scope: TestScope,
  env: Record<string, string> = {},
): Promise<{ exitCode: number; json: ApplyJson }> {
  const result = await apply(scope, env, ["--json"]);
  return { exitCode: result.exitCode, json: JSON.parse(result.stdout) as ApplyJson };
}

/** Writes the plugin files without registering them, as an apply without Claude Code does. */
export async function applyWithoutCli(scope: TestScope): Promise<string> {
  expect((await apply(scope)).exitCode).toBe(0);
  return await plannedVersion(scope, userArgs(scope), NAME);
}

/** A `claude` shim replaying `transcripts` for the user-scope plugin. */
export async function userHost(scope: TestScope, transcripts: FakeTranscript[]) {
  return await claudeScenarioShim(scope, "user", NAME, transcripts);
}
