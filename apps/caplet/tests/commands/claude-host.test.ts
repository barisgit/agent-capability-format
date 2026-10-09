/**
 * Claude host registration end to end (claude-plugin-output): `caplet apply` writes the plugin
 * files, then registers, updates and uninstalls the plugins through the `claude` CLI. A shim on
 * `PATH` replays the CLI transcripts recorded in task 5.1; the policy transcript is synthetic.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Diagnostic } from "@caplet/core";
import type { ClaudeScopeStatus } from "../../src/internal/claude-host-flow.js";
import {
  cleanup,
  makeScope,
  type RunResult,
  readText,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers.js";
import {
  atVersion,
  claudeHost,
  claudeMarketplaceDir,
  localPluginList,
  plannedVersion,
} from "../support/claude-scenario.js";
import type { FakeTranscript } from "../support/fake-claude-cli.js";

const scopes: TestScope[] = [];

afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

const NAME = "review";
const INSTALL = `claude plugin install ${NAME}@acf-user --scope user`;
const READ = ["claude plugin list --json", "claude plugin marketplace list --json"];

type ApplyJson = { ok: boolean; diagnostics: Diagnostic[]; claude?: ClaudeScopeStatus[] };

/** Writes capability `review` (a skill and an HTTP server) and selects it in the scope. */
async function reviewScope(acfScope: "user" | "project"): Promise<TestScope> {
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

async function writeSkill(scope: TestScope, body: string): Promise<void> {
  await writeText(
    path.join(scope.sourceRoot, NAME, "skills", NAME, "SKILL.md"),
    `---\nname: ${NAME}\ndescription: Review a change\n---\n${body}\n`,
  );
}

async function selectReview(scope: TestScope, agents: string, selected: boolean): Promise<void> {
  const entries = selected ? `\n  - source: path:${path.join(scope.sourceRoot, NAME)}\n` : " []\n";
  await writeText(path.join(agents, "capabilities.yml"), `acf: 1\ncapabilities:${entries}`);
}

function userArgs(scope: TestScope): string[] {
  return ["--cwd", scope.cwd, "--scope", "user", "--target", "claude"];
}

function pluginDir(scope: TestScope): string {
  return path.join(claudeMarketplaceDir(scope, "user"), "plugins", NAME);
}

function addMarketplace(scope: TestScope): string {
  return `claude plugin marketplace add ${claudeMarketplaceDir(scope, "user")} --scope user`;
}

async function apply(
  scope: TestScope,
  env: Record<string, string> = {},
  extra: string[] = [],
): Promise<RunResult> {
  return await runCaplet(scope, ["apply", ...userArgs(scope), ...extra], env);
}

async function applyJson(
  scope: TestScope,
  env: Record<string, string> = {},
): Promise<{ exitCode: number; json: ApplyJson }> {
  const result = await apply(scope, env, ["--json"]);
  return { exitCode: result.exitCode, json: JSON.parse(result.stdout) as ApplyJson };
}

/** Writes the plugin files without registering them, as an apply without Claude Code does. */
async function applyWithoutCli(scope: TestScope): Promise<string> {
  expect((await apply(scope)).exitCode).toBe(0);
  return await plannedVersion(scope, userArgs(scope), NAME);
}

async function userHost(scope: TestScope, transcripts: FakeTranscript[]) {
  return await claudeHost(scope, "user", NAME, transcripts);
}

test("apply installs a new plugin after adding the marketplace", async () => {
  const scope = await reviewScope("user");
  const version = await plannedVersion(scope, userArgs(scope), NAME);
  const host = await userHost(scope, [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-user",
    "install-user",
    atVersion("list-json-installed", version),
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    addMarketplace(scope),
    INSTALL,
    "claude plugin list --json",
  ]);
  expect(await host.unused()).toEqual([]);
  expect(json.diagnostics).toEqual([]);
  expect(json.claude?.[0]?.plugins).toEqual([
    expect.objectContaining({
      name: NAME,
      action: "install",
      state: "registered",
      files: "current",
    }),
  ]);
  expect(existsSync(path.join(pluginDir(scope), ".claude-plugin", "plugin.json"))).toBe(true);
});

test("apply leaves an unchanged plugin alone and reports it in human output", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "marketplace-add-already-known",
  ]);

  const result = await apply(scope, host.env);

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([...READ, addMarketplace(scope)]);
  expect(await host.unused()).toEqual([]);
  expect(result.stdout).toContain("Claude plugins user scope · acf-user");
  expect(result.stdout).toMatch(new RegExp(`${NAME} +registered +files current`));
});

test("apply updates a plugin whose content changed", async () => {
  const scope = await reviewScope("user");
  const before = await applyWithoutCli(scope);
  await writeSkill(scope, "Read the diff, then the tests.");
  const refreshed = await runCaplet(scope, [
    "update",
    ...userArgs(scope).slice(0, 4),
    "--no-apply",
  ]);
  expect(refreshed.exitCode).toBe(0);
  const after = await plannedVersion(scope, userArgs(scope), NAME);
  expect(after).not.toBe(before);
  const host = await userHost(scope, [
    atVersion("list-json-installed", before),
    "marketplace-list-json",
    "marketplace-add-already-known",
    "update-changed",
    atVersion("list-json-after-update", after, "1.0.0+acf.bbb"),
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    addMarketplace(scope),
    `claude plugin update ${NAME}@acf-user --scope user`,
    "claude plugin list --json",
  ]);
  expect(json.diagnostics).toEqual([]);
  expect(json.claude?.[0]?.plugins).toEqual([
    expect.objectContaining({ action: "update", state: "registered", version: after }),
  ]);
});

test("apply says in human output that it updated a plugin", async () => {
  const scope = await reviewScope("user");
  const before = await applyWithoutCli(scope);
  await writeSkill(scope, "Read the diff, then the tests.");
  const refreshed = await runCaplet(scope, [
    "update",
    ...userArgs(scope).slice(0, 4),
    "--no-apply",
  ]);
  expect(refreshed.exitCode).toBe(0);
  const after = await plannedVersion(scope, userArgs(scope), NAME);
  const host = await userHost(scope, [
    atVersion("list-json-installed", before),
    "marketplace-list-json",
    "marketplace-add-already-known",
    "update-changed",
    atVersion("list-json-after-update", after, "1.0.0+acf.bbb"),
  ]);

  const result = await apply(scope, host.env);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(new RegExp(`${NAME} +registered +files current +updated\n`));
});

test("apply uninstalls a deselected plugin and removes the marketplace before deleting files", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  await selectReview(scope, path.join(scope.home, ".agents"), false);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "marketplace-remove",
    "list-json-empty",
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin marketplace remove acf-user",
    "claude plugin list --json",
  ]);
  expect(json.diagnostics).toEqual([]);
  expect(existsSync(claudeMarketplaceDir(scope, "user"))).toBe(false);
  const sidecar = JSON.parse(await readText(path.join(scope.home, ".claude", ".acf-managed.json")));
  expect(sidecar.marketplace).toBeUndefined();
});

test("without the CLI a deselected plugin keeps its files and the warning lists the uninstall", async () => {
  const scope = await reviewScope("user");
  await applyWithoutCli(scope);
  await selectReview(scope, path.join(scope.home, ".agents"), false);

  const { exitCode, json } = await applyJson(scope);

  expect(exitCode).toBe(0);
  expect(existsSync(pluginDir(scope))).toBe(true);
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.message).toContain(`claude plugin uninstall ${NAME}@acf-user --scope user`);
  expect(warning?.message).toContain("claude plugin marketplace remove acf-user");
});

test("remove uninstalls the plugin and removes the marketplace before deleting files", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "marketplace-remove",
    "list-json-empty",
  ]);

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"], host.env);

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin marketplace remove acf-user",
    "claude plugin list --json",
  ]);
  const json = JSON.parse(result.stdout) as ApplyJson;
  expect(json.diagnostics).toEqual([]);
  expect(existsSync(claudeMarketplaceDir(scope, "user"))).toBe(false);
  const sidecar = JSON.parse(await readText(path.join(scope.home, ".claude", ".acf-managed.json")));
  expect(sidecar.marketplace).toBeUndefined();
  expect(sidecar.managed.map((entry: { capability: string }) => entry.capability)).not.toContain(
    NAME,
  );
});

test("remove keeps a marketplace another Claude settings file declares, with an empty catalog", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  // `marketplace remove` run from the working directory would also drop this declaration.
  const projectSettings = path.join(scope.cwd, ".claude", "settings.json");
  await writeText(
    projectSettings,
    JSON.stringify({ extraKnownMarketplaces: { "acf-user": { source: { source: "directory" } } } }),
  );
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "list-json-empty",
  ]);

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"], host.env);

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    ...READ,
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin list --json",
  ]);
  const json = JSON.parse(result.stdout) as ApplyJson;
  const kept = json.diagnostics.find((d) => d.code === "acf.claude.marketplace-kept");
  expect(kept?.severity).toBe("warn");
  expect(kept?.message).toContain(projectSettings);
  expect(kept?.message).toContain("claude plugin marketplace remove acf-user");
  expect(existsSync(pluginDir(scope))).toBe(false);
  const catalog = JSON.parse(
    await readText(
      path.join(claudeMarketplaceDir(scope, "user"), ".claude-plugin", "marketplace.json"),
    ),
  );
  expect(catalog).toMatchObject({ name: "acf-user", plugins: [] });
  const sidecar = JSON.parse(await readText(path.join(scope.home, ".claude", ".acf-managed.json")));
  expect(sidecar.marketplace).toEqual({ name: "acf-user", scope: "user" });
});

test("without the CLI remove keeps the plugin files and the warning lists the uninstall", async () => {
  const scope = await reviewScope("user");
  await applyWithoutCli(scope);

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"]);

  expect(result.exitCode).toBe(0);
  expect(existsSync(pluginDir(scope))).toBe(true);
  const json = JSON.parse(result.stdout) as ApplyJson;
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.message).toContain(`claude plugin uninstall ${NAME}@acf-user --scope user`);
  expect(warning?.message).toContain("claude plugin marketplace remove acf-user");
});

test("without the CLI remove names what keeps the marketplace registered", async () => {
  const scope = await reviewScope("user");
  await applyWithoutCli(scope);
  const projectSettings = path.join(scope.cwd, ".claude", "settings.json");
  await writeText(
    projectSettings,
    JSON.stringify({ extraKnownMarketplaces: { "acf-user": { source: { source: "directory" } } } }),
  );

  const result = await runCaplet(scope, ["remove", NAME, ...userArgs(scope), "--json"]);

  expect(result.exitCode).toBe(0);
  const json = JSON.parse(result.stdout) as ApplyJson;
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.message).toContain(`claude plugin uninstall ${NAME}@acf-user --scope user`);
  expect(warning?.message).not.toContain("marketplace remove");
  const kept = json.diagnostics.find((d) => d.code === "acf.claude.marketplace-kept");
  expect(kept?.message).toContain(projectSettings);
  expect(kept?.message).toContain("claude plugin marketplace remove acf-user");
  // The plugin is still installed, so its catalog entry stays.
  expect(kept?.message).not.toContain("empty catalog");
});

test("a plugin the user disabled is updated and stays disabled", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  const host = await userHost(scope, [
    "list-json-disabled",
    "marketplace-list-json",
    "marketplace-add-already-known",
    "update-while-disabled",
    atVersion("list-json-after-update-while-disabled", version, "1.0.2"),
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(0);
  const calls = await host.calls();
  expect(calls).toContain(`claude plugin update ${NAME}@acf-user --scope user`);
  expect(calls.some((call) => call.includes("enable"))).toBe(false);
  expect(json.claude?.[0]?.plugins).toEqual([
    expect.objectContaining({ action: "update", state: "disabled by user" }),
  ]);
});

test("without the CLI apply writes the files, exits 0 and lists the commands to run", async () => {
  const scope = await reviewScope("user");

  const { exitCode, json } = await applyJson(scope);

  expect(exitCode).toBe(0);
  expect(existsSync(path.join(pluginDir(scope), ".claude-plugin", "plugin.json"))).toBe(true);
  expect(json.claude?.[0]?.plugins).toEqual([
    expect.objectContaining({ name: NAME, state: "registration required", files: "current" }),
  ]);
  const warning = json.diagnostics.find((d) => d.code === "acf.claude.cli-unavailable");
  expect(warning?.severity).toBe("warn");
  expect(warning?.message).toContain(addMarketplace(scope));
  expect(warning?.message).toContain(INSTALL);
});

test("a host policy block is a warning and nothing falls back to loose files (synthetic transcript)", async () => {
  const scope = await reviewScope("user");
  const host = await userHost(scope, [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-user",
    "install-policy-blocked",
    "list-json-empty",
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(0);
  expect(await host.unexpected()).toEqual([]);
  expect(json.claude?.[0]?.plugins).toEqual([
    expect.objectContaining({ name: NAME, state: "blocked by host policy" }),
  ]);
  expect(json.diagnostics.map((d) => d.code)).toContain("acf.claude.policy-blocked");
  expect(existsSync(path.join(scope.home, ".claude", "skills", NAME))).toBe(false);
});

test("a failed install is an error carrying Claude's message", async () => {
  const scope = await reviewScope("user");
  const host = await userHost(scope, [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-user",
    { fixture: "install-unknown-plugin", replace: { nope: NAME } },
    "list-json-empty",
  ]);

  const { exitCode, json } = await applyJson(scope, host.env);

  expect(exitCode).toBe(2);
  expect(await host.unexpected()).toEqual([]);
  const plugin = json.claude?.[0]?.plugins[0];
  expect(plugin?.state).toBe("registration required");
  expect(plugin?.message).toContain("not found in marketplace");
  expect(json.diagnostics.map((d) => d.code)).toContain("acf.claude.command-failed");
});

test("dry run reads host state and shows the commands without running them", async () => {
  const scope = await reviewScope("user");
  const host = await userHost(scope, ["list-json-empty", "marketplace-list-json-empty"]);

  const result = await apply(scope, host.env, ["--dry-run"]);

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual(READ);
  expect(existsSync(pluginDir(scope))).toBe(false);
  expect(result.stdout).toContain("would run");
  expect(result.stdout).toContain(addMarketplace(scope));
  expect(result.stdout).toContain(INSTALL);
});

test("status lists no pending command for a registered, unchanged plugin", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
  ]);

  const result = await runCaplet(scope, ["status", ...userArgs(scope).slice(0, 4)], host.env);

  expect(await host.calls()).toEqual(READ);
  expect(result.stdout).toMatch(new RegExp(`${NAME} +registered +files current`));
  // Apply re-runs the idempotent marketplace add, but it changes nothing Claude already lists.
  expect(result.stdout).not.toContain("would run");
  expect(result.stdout).not.toContain("marketplace add");
});

test("status reports host and file state without changing the host", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  const host = await userHost(scope, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
  ]);

  const result = await runCaplet(
    scope,
    ["status", ...userArgs(scope).slice(0, 4), "--json"],
    host.env,
  );

  expect(await host.calls()).toEqual(READ);
  const json = JSON.parse(result.stdout) as ApplyJson;
  expect(json.claude?.[0]?.plugins).toEqual([
    expect.objectContaining({ name: NAME, state: "registered", files: "current" }),
  ]);
});

test("a project registers at Claude local scope from the project root", async () => {
  const scope = await reviewScope("project");
  const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "claude"];
  const version = await plannedVersion(scope, args, NAME);
  const host = await claudeHost(scope, "project", NAME, [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-local",
    "install-local",
    localPluginList(version),
  ]);

  const result = await runCaplet(scope, ["apply", ...args], host.env);

  expect(result.exitCode).toBe(0);
  expect(await host.unused()).toEqual([]);
  expect(new Set(await host.cwds())).toEqual(new Set([scope.cwd]));
  expect(result.stdout).toContain("registered for this checkout only, at Claude local scope");
  expect(result.stdout).toContain(".claude/settings.local.json");
});

test("status prints each diagnostic once and one blank line after the Claude block", async () => {
  const scope = await reviewScope("user");
  await writeText(
    path.join(scope.home, ".agents", "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, NAME)}\n    exclude: { mcp: [missing] }\n`,
  );
  await applyWithoutCli(scope);
  const host = await userHost(scope, ["list-json-empty", "marketplace-list-json-empty"]);

  const result = await runCaplet(scope, ["status", ...userArgs(scope).slice(0, 4)], host.env);

  expect(result.stdout).toContain("would run");
  const output = `${result.stdout}${result.stderr}`;
  expect(output.split("missing").length - 1).toBe(1);
  expect(result.stdout).toMatch(/--scope user\n\n\S/);
});

test("dry run and status preview a kept marketplace as the empty catalog apply writes", async () => {
  const scope = await reviewScope("user");
  const version = await applyWithoutCli(scope);
  await writeText(
    path.join(scope.cwd, ".claude", "settings.json"),
    JSON.stringify({ extraKnownMarketplaces: { "acf-user": { source: { source: "directory" } } } }),
  );
  await selectReview(scope, path.join(scope.home, ".agents"), false);
  const state = [atVersion("list-json-installed", version), "marketplace-list-json"];
  const host = await userHost(scope, [...state, ...state, ...state, ...state]);
  const catalog = path.join(
    claudeMarketplaceDir(scope, "user"),
    ".claude-plugin",
    "marketplace.json",
  );
  type Change = { action: string; path: string };
  const catalogChange = (stdout: string) =>
    (JSON.parse(stdout) as { plan: { changes: Change[] } }).plan.changes.find((change) =>
      catalog.endsWith(change.path),
    );

  const dry = await apply(scope, host.env, ["--dry-run", "--json"]);
  const status = await runCaplet(
    scope,
    ["status", ...userArgs(scope).slice(0, 4), "--json"],
    host.env,
  );

  expect(dry.exitCode).toBe(0);
  expect(catalogChange(dry.stdout)?.action).toBe("update");
  const dryJson = JSON.parse(dry.stdout) as ApplyJson & { plan: { fileCount: number } };
  expect(dryJson.diagnostics.map((item) => item.code)).toContain("acf.claude.marketplace-kept");
  const pending = (stdout: string) => (JSON.parse(stdout) as { pending: number }).pending;
  expect(pending(status.stdout)).toBe(dryJson.plan.fileCount);

  // Once the catalog is already empty, nothing about it is pending.
  await writeText(
    catalog,
    `${JSON.stringify({ name: "acf-user", owner: { name: "caplet" }, plugins: [] }, null, 2)}\n`,
  );
  const settled = await apply(scope, host.env, ["--dry-run", "--json"]);
  const settledStatus = await runCaplet(
    scope,
    ["status", ...userArgs(scope).slice(0, 4), "--json"],
    host.env,
  );
  expect(catalogChange(settled.stdout)).toBeUndefined();
  expect(pending(settledStatus.stdout)).toBe(dryJson.plan.fileCount - 1);
});
