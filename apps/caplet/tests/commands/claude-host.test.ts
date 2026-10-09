/**
 * Claude host registration end to end (claude-plugin-output): `caplet apply` writes the plugin
 * files, then registers and updates the plugins through the `claude` CLI. A shim on `PATH`
 * replays the CLI transcripts recorded in task 5.1; the policy transcript is synthetic. Uninstalls
 * are in claude-host-uninstall.test.ts.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { runCaplet, writeText } from "../helpers.js";
import {
  type ApplyJson,
  addMarketplace,
  apply,
  applyJson,
  applyWithoutCli,
  cleanupReviewScopes,
  INSTALL,
  NAME,
  pluginDir,
  READ,
  reviewScope,
  selectReview,
  userArgs,
  userHost,
  writeSkill,
} from "../support/claude-review.js";
import {
  atVersion,
  claudeMarketplaceDir,
  claudeScenarioShim,
  localPluginList,
  plannedVersion,
} from "../support/claude-scenario.js";

afterEach(cleanupReviewScopes);

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

test("a dry run whose Claude state read fails reports the error and exits 2", async () => {
  const scope = await reviewScope("user");
  // No transcript matches `claude plugin list --json`, so the fake claude exits non-zero.
  const host = await userHost(scope, []);

  const human = await apply(scope, host.env, ["--dry-run"]);
  const machine = await apply(scope, host.env, ["--dry-run", "--json"]);

  expect(human.exitCode).toBe(2);
  expect(human.stderr).toContain("acf.claude.command-failed");
  expect(machine.exitCode).toBe(2);
  const json = JSON.parse(machine.stdout) as ApplyJson;
  expect(json.ok).toBe(false);
  expect(json.diagnostics.map((d) => d.code)).toContain("acf.claude.command-failed");
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
  const host = await claudeScenarioShim(scope, "project", NAME, [
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
