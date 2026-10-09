/**
 * A capability whose every component is left out for Claude gets no Claude plugin, and the plugin
 * an earlier apply installed for it is retired like that of a deselected capability.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
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

const NAME = "review";

test("apply retires the plugin of a capability that no longer carries anything for Claude", async () => {
  const scope = await makeScope();
  scopes.push(scope);
  const source = path.join(scope.sourceRoot, NAME);
  await writeText(path.join(source, "acf.yml"), `acf: 1\nname: ${NAME}\nversion: 1.0.0\n`);
  await writeText(
    path.join(source, "skills", NAME, "SKILL.md"),
    `---\nname: ${NAME}\ndescription: Review a change\n---\nRead the diff first.\n`,
  );
  await writeText(path.join(source, "README.md"), "Docs.\n");
  const agents = path.join(scope.home, ".agents");
  await writeText(path.join(agents, "caplet.yml"), "targets:\n  claude:\n    carrier: plugin\n");
  const select = async (selection: string): Promise<void> =>
    await writeText(
      path.join(agents, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${source}\n${selection}`,
    );
  await select("");
  const args = ["apply", "--cwd", scope.cwd, "--scope", "user", "--target", "claude"];
  // Without the CLI apply writes the plugin files; the host then reports the plugin installed.
  expect((await runCaplet(scope, args)).exitCode).toBe(0);
  const version = await plannedVersion(scope, args.slice(1), NAME);
  const pluginDir = path.join(claudeMarketplaceDir(scope, "user"), "plugins", NAME);
  expect(existsSync(pluginDir)).toBe(true);

  await select("    exclude:\n      skills: [review]\n");
  const host = await claudeScenarioShim(scope, "user", NAME, [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    "uninstall-user",
    "marketplace-remove",
    "list-json-empty",
  ]);
  const result = await runCaplet(scope, [...args, "--json"], host.env);
  const json = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };

  expect(result.exitCode).toBe(0);
  expect(await host.calls()).toEqual([
    "claude plugin list --json",
    "claude plugin marketplace list --json",
    `claude plugin uninstall ${NAME}@acf-user --scope user`,
    "claude plugin marketplace remove acf-user",
    "claude plugin list --json",
  ]);
  expect(json.diagnostics.map((d) => [d.severity, d.code])).toEqual([
    ["info", "acf.claude.plugin-empty"],
  ]);
  expect(existsSync(pluginDir)).toBe(false);
});
