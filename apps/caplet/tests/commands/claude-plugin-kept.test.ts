/**
 * A capability the scope still selects for Claude keeps its installed Claude plugin as it is when
 * its reader left out an invalid component and nothing else of it reaches Claude, or when a
 * refusal blocks it on Claude. Caplet then never uninstalls that plugin or removes its
 * marketplace, also when the version of the generated plugin cannot be read.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic } from "@caplet/core";
import { cleanup, makeScope, runCaplet, type TestScope, writeText } from "../helpers.js";
import {
  atVersion,
  claudeMarketplaceDir,
  claudeScenarioShim,
  plannedVersion,
} from "../support/claude-scenario.js";

const scopes: TestScope[] = [];

afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

const ARGS = ["--scope", "user", "--target", "claude"];

/** The generated manifest the installed plugin `name` was built from, at user scope. */
function pluginManifest(scope: TestScope, name: string): string {
  return path.join(
    claudeMarketplaceDir(scope, "user"),
    "plugins",
    name,
    ".claude-plugin",
    "plugin.json",
  );
}

/** The ways a generated manifest can stop naming the installed version. */
const unreadable: Array<[string, (file: string) => Promise<void>]> = [
  ["missing", async (file) => await rm(file)],
  ["not valid JSON", async (file) => await writeText(file, "{")],
];

/**
 * A user scope whose imported skill `fast` was applied as a Claude plugin without the CLI, and
 * whose skill then gains an invalid value, so its reader leaves it out and nothing of `fast`
 * reaches Claude.
 */
async function heldFast() {
  const scope = await makeScope();
  scopes.push(scope);
  const agents = path.join(scope.home, ".agents");
  const root = path.join(agents, "capabilities", "fast");
  await writeText(
    path.join(root, "acf.yml"),
    "acf: 1\nname: fast\nversion: 0.0.0-unmanifested+local\n",
  );
  await writeText(path.join(root, ".acf-import.json"), '{"acf":1,"synthesized":true}\n');
  const skill = path.join(root, "skills", "fast", "SKILL.md");
  await writeText(skill, "---\nname: fast\ndescription: Fast\n---\nBody.\n");
  await writeText(path.join(agents, "caplet.yml"), "targets:\n  claude:\n    carrier: plugin\n");
  const args = ["apply", "--cwd", scope.cwd, ...ARGS];
  expect((await runCaplet(scope, args)).exitCode).toBe(0);
  const version = await plannedVersion(scope, args.slice(1), "fast");
  const installed = path.join(
    claudeMarketplaceDir(scope, "user"),
    "plugins",
    "fast",
    "skills",
    "fast",
    "SKILL.md",
  );
  expect(existsSync(installed)).toBe(true);

  await writeText(skill, "---\nname: fast\ndescription: Fast\neffort: extreme\n---\nBody.\n");
  return { scope, args, version, installed };
}

/**
 * A user scope whose Agent Plugins package `files-kit` was applied as a Claude plugin without the
 * CLI, and which then gains a stdio MCP server running in the package directory, which Claude
 * refuses, so the refusal blocks `files-kit` on Claude.
 */
async function refusedFilesKit() {
  const scope = await makeScope();
  scopes.push(scope);
  const source = path.join(scope.sourceRoot, "files-kit");
  await writeText(
    path.join(source, "plugin.json"),
    '{\n  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",\n  "name": "files-kit",\n  "version": "1.0.0"\n}\n',
  );
  await writeText(
    path.join(source, "skills", "files", "SKILL.md"),
    "---\nname: files\ndescription: Find files\n---\nList first.\n",
  );
  await writeText(
    path.join(scope.home, ".agents", "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${source}\n`,
  );
  const args = ["apply", "--cwd", scope.cwd, ...ARGS];
  expect((await runCaplet(scope, args)).exitCode).toBe(0);
  const version = await plannedVersion(scope, args.slice(1), "files-kit");

  await writeText(
    path.join(source, "mcp.json"),
    '{\n  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",\n  "mcpServers": {\n    "files": { "type": "stdio", "command": "node", "args": ["server.js"] }\n  }\n}\n',
  );
  const update = ["update", "--cwd", scope.cwd, ...ARGS, "--no-apply"];
  expect((await runCaplet(scope, update)).exitCode).toBe(0);
  return { scope, args, version };
}

test("apply keeps the installed plugin of an imported skill its reader now leaves out as invalid", async () => {
  const { scope, args, version, installed } = await heldFast();
  const host = await claudeScenarioShim(scope, "user", "fast", [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "marketplace-add-already-known",
  ]);
  const result = await runCaplet(scope, [...args, "--json"], host.env);
  const json = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    "claude plugin list --json",
    "claude plugin marketplace list --json",
    `claude plugin marketplace add ${claudeMarketplaceDir(scope, "user")} --scope user`,
  ]);
  expect(json.diagnostics.map((d) => [d.severity, d.code])).toEqual([
    ["warn", "acf.source.component-invalid"],
    ["info", "acf.claude.plugin-empty"],
    ["warn", "acf.claude.plugin-kept"],
  ]);
  // Inside a project `caplet remove` defaults to project scope, so the advice names the scope.
  const kept = json.diagnostics.find((d) => d.code === "acf.claude.plugin-kept");
  expect(kept?.message).toContain("`caplet remove fast --scope user`");
  expect(existsSync(installed)).toBe(true);
});

for (const [state, damage] of unreadable) {
  test(`apply keeps a held plugin and its marketplace when its generated manifest is ${state}`, async () => {
    const { scope, args, version, installed } = await heldFast();
    await damage(pluginManifest(scope, "fast"));
    // Saved options make a data-deleting uninstall costly; nothing may uninstall the plugin.
    await writeText(
      path.join(scope.home, ".claude", "settings.json"),
      JSON.stringify({ pluginConfigs: { "fast@acf-user": { options: { region: "eu" } } } }),
    );
    const host = await claudeScenarioShim(scope, "user", "fast", [
      atVersion("list-json-installed", version),
      "marketplace-list-json",
    ]);
    const result = await runCaplet(scope, [...args, "--json"], host.env);
    const json = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };

    expect(result.exitCode).toBe(0);
    expect(await host.calls()).toEqual([
      "claude plugin list --json",
      "claude plugin marketplace list --json",
    ]);
    expect(json.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ["warn", "acf.source.component-invalid"],
      // The damaged manifest is a managed file changed since apply.
      ["info", "acf.emit.drift"],
      ["info", "acf.claude.plugin-empty"],
      ["warn", "acf.claude.manifest-unreadable"],
    ]);
    const warning = json.diagnostics.find((d) => d.code === "acf.claude.manifest-unreadable");
    expect(warning?.message).toContain("`caplet remove fast --scope user`");
    expect(existsSync(installed)).toBe(true);
  });
}

for (const [state, damage] of unreadable) {
  test(`apply keeps a refused plugin and its marketplace when its generated manifest is ${state}`, async () => {
    const { scope, args, version } = await refusedFilesKit();
    await damage(pluginManifest(scope, "files-kit"));
    const host = await claudeScenarioShim(scope, "user", "files-kit", [
      atVersion("list-json-installed", version),
      "marketplace-list-json",
    ]);
    const result = await runCaplet(scope, [...args, "--json"], host.env);
    const json = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };

    expect(result.exitCode).toBe(2);
    expect(await host.calls()).toEqual([
      "claude plugin list --json",
      "claude plugin marketplace list --json",
    ]);
    const codes = json.diagnostics.map((d) => d.code);
    expect(codes).toContain("acf.support.refused");
    expect(codes).toContain("acf.claude.manifest-unreadable");
    expect(existsSync(path.dirname(path.dirname(pluginManifest(scope, "files-kit"))))).toBe(true);
  });
}
