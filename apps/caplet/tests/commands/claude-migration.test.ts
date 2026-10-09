/**
 * Migration from loose Claude output to plugins (claude-plugin-output): once Claude reports the
 * plugin registered, apply retires the loose files caplet wrote unchanged, releases the ones the
 * user edited, keeps everything while registration fails, and announces the new invocation names
 * once per install root.
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
  claudeHost,
  claudeMarketplace,
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
  return await claudeHost(scope, "project", NAME, [
    "list-json-empty",
    "marketplace-list-json-empty",
    "marketplace-add-local",
    ...install,
  ]);
}

/** A shim on which the plugin is installed at `version` and the marketplace known. */
async function registeredHost(scope: TestScope, version: string) {
  return await claudeHost(scope, "project", NAME, [
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
    renameNoticeShown?: true;
  };
  files["sidecar.json"] = `${JSON.stringify(
    {
      renameNoticeShown: sidecar.renameNoticeShown ?? false,
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

  const host = await claudeHost(scope, "project", NAME, [
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
