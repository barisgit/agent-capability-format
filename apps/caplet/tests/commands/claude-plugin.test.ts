/**
 * The Claude plugin carrier end to end: apply writes each eligible capability as one plugin
 * package, and the install root's ACF-MANAGED.md lists the package as one directory.
 */
import { afterEach, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assertGoldenTree, goldenCase, treeFromFiles } from "@caplet/golden";
import { claudeMarketplaceName, resolveClaudeScopeTarget } from "../../src/hosts/claude/scope.js";
import {
  applyProject,
  cleanup,
  makeScope,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers.js";

const testsDir = path.resolve(import.meta.dir, "..");
const scopes: TestScope[] = [];

afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

/**
 * Every file under root, keyed by its relative path; executables keep their bit. The project
 * marketplace name hashes the temporary project path, so `marketplace` reads `acf-project-<h>`.
 */
async function filesUnder(
  root: string,
  marketplace: string,
): Promise<Record<string, string | { content: string; executable: boolean }>> {
  const files: Record<string, string | { content: string; executable: boolean }> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const content = (await readFile(full, "utf8")).replaceAll(marketplace, "acf-project-<h>");
    const executable = ((await stat(full)).mode & 0o111) !== 0;
    files[path.relative(root, full)] = executable ? { content, executable } : content;
  }
  return files;
}

/** Writes an ACF capability `name` with one skill and one HTTP server; returns its source dir. */
async function pluginSource(scope: TestScope, name: string): Promise<string> {
  const source = path.join(scope.sourceRoot, name);
  await writeText(
    path.join(source, "acf.yml"),
    `acf: 1\nname: ${name}\nversion: 1.0.0\ndescription: Review changes\n`,
  );
  await writeText(
    path.join(source, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Review a change\n---\nRead the diff first.\n`,
  );
  await writeText(
    path.join(source, "mcp", "mcp.yml"),
    "servers:\n  - name: diff\n    transport: http\n    url: https://mcp.example.com/diff\n",
  );
  return source;
}

/** Selects `sources` in the project's capabilities.yml. */
async function selectSources(scope: TestScope, sources: readonly string[]): Promise<void> {
  const entries = sources.map((source) => `  - source: path:${source}\n`).join("");
  await writeText(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:${entries === "" ? " []" : `\n${entries}`}\n`,
  );
}

async function projectMarketplace(scope: TestScope): Promise<string> {
  return claudeMarketplaceName(await resolveClaudeScopeTarget("project", scope.cwd));
}

async function pluginProject(): Promise<TestScope> {
  const scope = await makeScope();
  scopes.push(scope);
  await writeText(
    path.join(scope.agentsDir, "caplet.yml"),
    "targets:\n  claude:\n    carrier: plugin\n",
  );
  return scope;
}

test("apply writes a Claude plugin and lists it in the install-root inventory", async () => {
  const scope = await pluginProject();
  await selectSources(scope, [await pluginSource(scope, "review")]);

  const result = await applyProject(scope);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  const claudeRoot = path.join(scope.cwd, ".claude");
  const marketplace = await projectMarketplace(scope);
  // The sidecar records on-disk modes, which follow the umask for the inventory file.
  const { ".acf-managed.json": sidecar, ...files } = await filesUnder(claudeRoot, marketplace);
  if (typeof sidecar !== "string") throw new Error("apply wrote no sidecar");
  const managed = JSON.parse(sidecar) as { managed: { path: string; carrier: string }[] };
  expect(managed.managed.map((entry) => [entry.path, entry.carrier])).toEqual([
    [".acf/marketplace/.claude-plugin/marketplace.json", "plugin"],
    [".acf/marketplace/plugins/review/.claude-plugin/plugin.json", "plugin"],
    [".acf/marketplace/plugins/review/.mcp.json", "plugin"],
    [".acf/marketplace/plugins/review/skills/review/SKILL.md", "plugin"],
    ["ACF-MANAGED.md", "loose"],
  ]);
  await assertGoldenTree(
    treeFromFiles(files),
    goldenCase(testsDir, "apply-claude-plugin").expected,
  );
  await expect(stat(path.join(scope.cwd, ".mcp.json"))).rejects.toThrow();

  const rerun = await runCaplet(scope, [
    "apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
    "--dry-run",
    "--json",
  ]);
  expect(JSON.parse(rerun.stdout).plan.changes).toEqual([]);

  const again = await applyProject(scope);
  expect(again.exitCode).toBe(0);
  expect(await filesUnder(claudeRoot, marketplace)).toEqual({
    ".acf-managed.json": sidecar,
    ...files,
  });

  await selectSources(scope, []);
  expect((await applyProject(scope)).exitCode).toBe(0);
  await expect(
    stat(path.join(claudeRoot, ".acf", "marketplace", "plugins", "review")),
  ).rejects.toThrow();
});

test("the scope's marketplace lists every generated plugin and follows desired state", async () => {
  const scope = await pluginProject();
  const review = await pluginSource(scope, "review");
  const lint = await pluginSource(scope, "lint");
  await selectSources(scope, [review, lint]);
  const claudeRoot = path.join(scope.cwd, ".claude");
  const name = await projectMarketplace(scope);
  const marketplaceTree = async () => {
    const files = await filesUnder(claudeRoot, name);
    return treeFromFiles({
      ".acf/marketplace/.claude-plugin/marketplace.json":
        files[".acf/marketplace/.claude-plugin/marketplace.json"] ?? "",
      "ACF-MANAGED.md": files["ACF-MANAGED.md"] ?? "",
    });
  };
  const recorded = async () =>
    (
      JSON.parse(await readFile(path.join(claudeRoot, ".acf-managed.json"), "utf8")) as {
        marketplace?: unknown;
      }
    ).marketplace;

  expect((await applyProject(scope)).exitCode).toBe(0);
  await assertGoldenTree(
    await marketplaceTree(),
    goldenCase(testsDir, "claude-marketplace-add").expected,
  );
  expect(await recorded()).toEqual({ name, scope: "local" });

  await selectSources(scope, [review]);
  expect((await applyProject(scope)).exitCode).toBe(0);
  await assertGoldenTree(
    await marketplaceTree(),
    goldenCase(testsDir, "claude-marketplace-remove").expected,
  );
  await expect(
    stat(path.join(claudeRoot, ".acf", "marketplace", "plugins", "lint")),
  ).rejects.toThrow();

  await selectSources(scope, []);
  expect((await applyProject(scope)).exitCode).toBe(0);
  await expect(stat(path.join(claudeRoot, ".acf", "marketplace"))).rejects.toThrow();
  expect(await recorded()).toBeUndefined();
});
