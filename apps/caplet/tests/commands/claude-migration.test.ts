/**
 * Migration from loose Claude output to plugins (claude-plugin-output): once Claude reports the
 * plugin registered, apply retires the loose files caplet wrote unchanged, releases the ones the
 * user edited, keeps everything while registration fails, and announces the new invocation names
 * on the apply that retires the loose skills. Switching back to the loose carrier uninstalls the plugin.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic } from "@caplet/core";
import { assertGoldenTree, goldenCase, treeFromFiles } from "@caplet/golden";
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
  claudeMarketplace,
  claudeScenarioShim,
  localPluginList,
  plannedVersion,
} from "../support/claude-scenario.js";
import type { FakeTranscript } from "../support/fake-claude-cli.js";

const testsDir = path.resolve(import.meta.dir, "..");
const scopes: TestScope[] = [];

afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

const NAME = "review";
const NOTICE = "Claude skills are now invoked through their plugins";

type Rename = { scope: string; capability: string; from: string; to: string };
type ApplyJson = { diagnostics: Diagnostic[]; renames?: Rename[] };

function args(scope: TestScope): string[] {
  return ["apply", "--cwd", scope.cwd, "--scope", "project", "--target", "claude"];
}

/**
 * A project whose capability `review` (a skill and an HTTP server) is installed as loose Claude
 * files, and whose configuration then falls back to the default plugin carrier.
 */
async function looseProject(): Promise<TestScope> {
  const scope = await makeScope();
  scopes.push(scope);
  const source = path.join(scope.sourceRoot, NAME);
  await writeText(
    path.join(source, "acf.yml"),
    `acf: 1\nname: ${NAME}\nversion: 1.0.0\ndescription: Review changes\n`,
  );
  await writeText(
    path.join(source, "skills", NAME, "SKILL.md"),
    `---\nname: ${NAME}\ndescription: Review a change\n---\nRead the diff first.\n`,
  );
  await writeText(
    path.join(source, "mcp", "mcp.yml"),
    "servers:\n  - name: diff\n    transport: http\n    url: https://mcp.example.com/diff\n",
  );
  await writeText(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${source}\n`,
  );
  const config = path.join(scope.agentsDir, "caplet.yml");
  await writeText(config, "targets:\n  claude:\n    carrier: loose\n");
  const loose = await runCaplet(scope, args(scope));
  if (loose.exitCode !== 0) throw new Error(loose.stdout + loose.stderr);
  expect(existsSync(looseSkill(scope))).toBe(true);
  await writeText(config, "acf: 1\n");
  return scope;
}

function looseSkill(scope: TestScope): string {
  return path.join(scope.cwd, ".claude", "skills", NAME, "SKILL.md");
}

/** A shim on which the plugin is not installed yet and `install` ends as `result`. */
async function installHost(scope: TestScope, version: string, result: "ok" | "fail") {
  const install: FakeTranscript[] =
    result === "ok"
      ? ["install-local", localPluginList(version)]
      : [
          // The recorded user-scope failure, issued at local scope.
          { fixture: "install-unknown-plugin", replace: { nope: NAME, user: "local" } },
          "list-json-empty",
        ];
  return await claudeScenarioShim(scope, "project", NAME, [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-local",
    ...install,
  ]);
}

/** A shim on which the plugin is installed at `version` and the marketplace known. */
async function registeredHost(scope: TestScope, version: string) {
  return await claudeScenarioShim(scope, "project", NAME, [
    localPluginList(version),
    "marketplace-list-json",
    "marketplace-add-local",
  ]);
}

/**
 * The project's Claude output as a golden tree: the files under `.claude/` and `.mcp.json`, the
 * sidecar's entries, and the run's output, with temporary paths and the hashed marketplace name
 * replaced.
 */
async function snapshot(scope: TestScope, result: RunResult) {
  const marketplace = await claudeMarketplace(scope, "project");
  const normalize = (text: string) =>
    text
      .replaceAll(scope.cwd, "<PROJECT>")
      .replaceAll(scope.sourceRoot, "<SOURCES>")
      .replaceAll(marketplace, "acf-project-<h>");
  const files: Record<string, string> = {};
  const claudeRoot = path.join(scope.cwd, ".claude");
  for (const entry of await readdir(claudeRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name === ".acf-managed.json") continue;
    const full = path.join(entry.parentPath, entry.name);
    files[`project/${path.relative(scope.cwd, full)}`] = normalize(await readFile(full, "utf8"));
  }
  const mcp = path.join(scope.cwd, ".mcp.json");
  if (existsSync(mcp)) files["project/.mcp.json"] = await readText(mcp);
  const sidecar = JSON.parse(await readText(path.join(claudeRoot, ".acf-managed.json"))) as {
    managed: { path: string; capability: string; carrier?: string }[];
  };
  files["sidecar.json"] = `${JSON.stringify(
    {
      managed: sidecar.managed.map((entry) => `${entry.path} ${entry.capability} ${entry.carrier}`),
    },
    null,
    2,
  )}\n`;
  files["stdout.txt"] = normalize(result.stdout);
  files["stderr.txt"] = normalize(result.stderr);
  return treeFromFiles(files);
}

async function migrate(scope: TestScope, result: "ok" | "fail") {
  const version = await plannedVersion(scope, args(scope).slice(1), NAME);
  const host = await installHost(scope, version, result);
  const applied = await runCaplet(scope, args(scope), host.env);
  expect(await host.unused()).toEqual([]);
  expect(await host.unexpected()).toEqual([]);
  return { version, applied };
}

test("a registered plugin retires the loose Claude files and announces the rename once", async () => {
  const scope = await looseProject();
  const planned = await runCaplet(scope, [...args(scope), "--dry-run", "--json"]);
  expect((JSON.parse(planned.stdout) as ApplyJson).renames).toEqual([
    { scope: "project", capability: NAME, from: `/${NAME}`, to: `/${NAME}:${NAME}` },
  ]);

  const { version, applied } = await migrate(scope, "ok");

  expect(applied.exitCode).toBe(0);
  expect(applied.stdout).toContain(NOTICE);
  await assertGoldenTree(
    await snapshot(scope, applied),
    goldenCase(testsDir, "claude-migration-clean").expected,
  );

  const host = await registeredHost(scope, version);
  const again = await runCaplet(scope, [...args(scope), "--json"], host.env);
  expect(again.exitCode).toBe(0);
  expect((JSON.parse(again.stdout) as ApplyJson).renames).toBeUndefined();
  const human = await runCaplet(scope, args(scope), (await registeredHost(scope, version)).env);
  expect(human.stdout).not.toContain(NOTICE);
});

test("an edited loose file stays in place, leaves management and is reported", async () => {
  const scope = await looseProject();
  await writeText(looseSkill(scope), "---\nname: review\n---\nMy own notes.\n");

  const { applied } = await migrate(scope, "ok");

  expect(applied.exitCode).toBe(0);
  expect(await readText(looseSkill(scope))).toBe("---\nname: review\n---\nMy own notes.\n");
  expect(applied.stderr).toContain("acf.migration.drifted");
  await assertGoldenTree(
    await snapshot(scope, applied),
    goldenCase(testsDir, "claude-migration-drifted").expected,
  );
});

test("a failed registration keeps the loose files managed until a later apply registers it", async () => {
  const scope = await looseProject();

  const { version, applied } = await migrate(scope, "fail");

  expect(applied.exitCode).toBe(2);
  expect(applied.stdout).not.toContain(NOTICE);
  await assertGoldenTree(
    await snapshot(scope, applied),
    goldenCase(testsDir, "claude-migration-failed").expected,
  );

  const host = await claudeScenarioShim(scope, "project", NAME, [
    "list-json-empty",
    "marketplace-list-json",
    "marketplace-add-local",
    "install-local",
    localPluginList(version),
  ]);
  const retry = await runCaplet(scope, [...args(scope), "--json"], host.env);
  expect(retry.exitCode).toBe(0);
  expect((JSON.parse(retry.stdout) as ApplyJson).renames).toEqual([
    { scope: "project", capability: NAME, from: `/${NAME}`, to: `/${NAME}:${NAME}` },
  ]);
  expect(existsSync(looseSkill(scope))).toBe(false);
});

test("a plugin installed only at another Claude scope does not retire the loose files", async () => {
  const scope = await looseProject();
  const version = await plannedVersion(scope, args(scope).slice(1), NAME);
  const marketplace = await claudeMarketplace(scope, "project");
  // Claude lists the plugin at Claude project scope, which caplet leaves alone, and not at local.
  const host = await claudeScenarioShim(scope, "project", NAME, [
    {
      fixture: "list-json-project-and-local",
      replace: {
        "1.0.0+acf.aaa": version,
        "local1@acf-project-spike": "local1@team-mkt",
        "probe@acf-project-spike": `${NAME}@${marketplace}`,
      },
    },
    "marketplace-list-json",
    "marketplace-add-local",
  ]);
  const applied = await runCaplet(scope, [...args(scope), "--json"], host.env);
  expect(await host.unused()).toEqual([]);
  expect(await host.unexpected()).toEqual([]);
  expect(applied.exitCode).toBe(0);
  const json = JSON.parse(applied.stdout) as ApplyJson;
  expect(json.renames).toBeUndefined();
  expect(json.diagnostics.map((d) => d.code)).toContain("acf.claude.other-scope");
  expect(existsSync(looseSkill(scope))).toBe(true);
});

/** Switches the project's Claude carrier to loose and applies; the plugin is installed at `version`. */
async function switchToLoose(scope: TestScope, version: string) {
  await writeText(
    path.join(scope.agentsDir, "caplet.yml"),
    "targets:\n  claude:\n    carrier: loose\n",
  );
  const host = await claudeScenarioShim(scope, "project", NAME, [
    localPluginList(version),
    "marketplace-list-json",
    "uninstall-local-keep-data",
    "list-json-empty",
    "marketplace-remove",
  ]);
  const applied = await runCaplet(scope, args(scope), host.env);
  expect(await host.unused()).toEqual([]);
  expect(await host.unexpected()).toEqual([]);
  return applied;
}

test("switching Claude to the loose carrier uninstalls the plugin and writes loose files", async () => {
  const scope = await looseProject();
  const { version } = await migrate(scope, "ok");
  const marketplaceDir = path.join(scope.cwd, ".claude", ".acf", "marketplace");
  expect(existsSync(path.join(marketplaceDir, "plugins", NAME))).toBe(true);

  const applied = await switchToLoose(scope, version);

  expect(applied.exitCode).toBe(0);
  expect(existsSync(looseSkill(scope))).toBe(true);
  expect(await readText(path.join(scope.cwd, ".mcp.json"))).toContain('"diff"');
  expect(existsSync(marketplaceDir)).toBe(false);
  const sidecar = JSON.parse(
    await readText(path.join(scope.cwd, ".claude", ".acf-managed.json")),
  ) as { marketplace?: unknown; managed: { carrier?: string }[] };
  expect(sidecar.marketplace).toBeUndefined();
  expect(sidecar.managed.some((entry) => entry.carrier === "plugin")).toBe(false);
});

for (const [label, seed] of [
  [
    "Claude saved options for it",
    async (scope: TestScope, id: string) =>
      await writeText(
        path.join(scope.home, ".claude", "settings.json"),
        JSON.stringify({ pluginConfigs: { [id]: { options: { region: "eu" } } } }),
      ),
  ],
  [
    "its manifest declares user configuration",
    async (scope: TestScope) => {
      const manifest = path.join(
        scope.cwd,
        ".claude/.acf/marketplace/plugins",
        NAME,
        ".claude-plugin/plugin.json",
      );
      const parsed = JSON.parse(await readText(manifest)) as Record<string, unknown>;
      parsed.userConfig = { token: { type: "string", sensitive: true } };
      await writeText(manifest, JSON.stringify(parsed));
    },
  ],
] as const) {
  test(`switching to loose keeps the plugin installed when ${label}`, async () => {
    const scope = await looseProject();
    const { version } = await migrate(scope, "ok");
    const id = `${NAME}@${await claudeMarketplace(scope, "project")}`;
    await seed(scope, id);
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "targets:\n  claude:\n    carrier: loose\n",
    );
    const host = await claudeScenarioShim(scope, "project", NAME, [
      localPluginList(version),
      "marketplace-list-json",
    ]);

    const applied = await runCaplet(scope, [...args(scope), "--json"], host.env);

    expect(await host.unused()).toEqual([]);
    expect(await host.unexpected()).toEqual([]);
    expect(applied.exitCode).toBe(0);
    const held = (JSON.parse(applied.stdout) as ApplyJson).diagnostics.find(
      (d) => d.code === "acf.claude.uninstall-held",
    );
    expect(held?.message).toContain(`claude plugin uninstall ${id} --scope local --keep-data`);
    const plugin = path.join(scope.cwd, ".claude/.acf/marketplace/plugins", NAME);
    expect(existsSync(plugin)).toBe(true);
  });
}

test("a capability that migrates again later in the same install root announces its rename again", async () => {
  const scope = await looseProject();
  const { version } = await migrate(scope, "ok");
  expect((await switchToLoose(scope, version)).exitCode).toBe(0);
  await writeText(path.join(scope.agentsDir, "caplet.yml"), "acf: 1\n");

  const { applied } = await migrate(scope, "ok");

  expect(applied.exitCode).toBe(0);
  expect(applied.stdout).toContain(NOTICE);
  expect(applied.stdout).toContain(`/${NAME} -> /${NAME}:${NAME}`);
  expect(existsSync(looseSkill(scope))).toBe(false);
});

test("an MCP-only capability switching to loose at user scope keeps Claude's plugin data", async () => {
  const scope = await makeScope();
  scopes.push(scope);
  const source = path.join(scope.sourceRoot, "tools");
  await writeText(path.join(source, "acf.yml"), "acf: 1\nname: tools\nversion: 1.0.0\n");
  await writeText(
    path.join(source, "mcp", "mcp.yml"),
    "servers:\n  - name: diff\n    transport: http\n    url: https://mcp.example.com/diff\n",
  );
  const agents = path.join(scope.home, ".agents");
  await writeText(
    path.join(agents, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${source}\n`,
  );
  const userArgs = ["apply", "--cwd", scope.cwd, "--scope", "user", "--target", "claude"];
  // Without the CLI apply writes the plugin files; the host then reports the plugin installed.
  expect((await runCaplet(scope, userArgs)).exitCode).toBe(0);
  const version = await plannedVersion(scope, userArgs.slice(1), "tools");
  await writeText(path.join(agents, "caplet.yml"), "targets:\n  claude:\n    carrier: loose\n");
  const host = await claudeScenarioShim(scope, "user", "tools", [
    atVersion("list-json-installed", version),
    "marketplace-list-json",
    { fixture: "uninstall-local-keep-data", replace: { local1: "tools", local: "user" } },
    "marketplace-remove",
    "list-json-empty",
  ]);

  const applied = await runCaplet(scope, userArgs, host.env);

  expect(applied.exitCode).toBe(0);
  expect(await host.calls()).toContain(
    "claude plugin uninstall tools@acf-user --scope user --keep-data",
  );
  expect(await host.unused()).toEqual([]);
  expect(await host.unexpected()).toEqual([]);
});
