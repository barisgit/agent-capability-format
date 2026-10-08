/**
 * The Claude plugin carrier end to end: apply writes each eligible capability as one plugin
 * package, and the install root's ACF-MANAGED.md lists the package as one directory.
 */
import { afterEach, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assertGoldenTree, goldenCase, treeFromFiles } from "@caplet/golden";
import { applyProject, cleanup, makeScope, type TestScope, writeText } from "../helpers.js";

const testsDir = path.resolve(import.meta.dir, "..");
const scopes: TestScope[] = [];

afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

/** Every file under root, keyed by its relative path; executables keep their bit. */
async function filesUnder(
  root: string,
): Promise<Record<string, string | { content: string; executable: boolean }>> {
  const files: Record<string, string | { content: string; executable: boolean }> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const content = await readFile(full, "utf8");
    const executable = ((await stat(full)).mode & 0o111) !== 0;
    files[path.relative(root, full)] = executable ? { content, executable } : content;
  }
  return files;
}

test("apply writes a Claude plugin and lists it in the install-root inventory", async () => {
  const scope = await makeScope();
  scopes.push(scope);
  const source = path.join(scope.sourceRoot, "review");
  await writeText(
    path.join(source, "acf.yml"),
    "acf: 1\nname: review\nversion: 1.0.0\ndescription: Review changes\n",
  );
  await writeText(
    path.join(source, "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review a change\n---\nRead the diff first.\n",
  );
  await writeText(
    path.join(source, "mcp", "mcp.yml"),
    "servers:\n  - name: diff\n    transport: http\n    url: https://mcp.example.com/diff\n",
  );
  await writeText(
    path.join(scope.agentsDir, "capabilities.yml"),
    "acf: 1\ncapabilities:\n  - source: path:" + source + "\n",
  );
  await writeText(
    path.join(scope.agentsDir, "caplet.yml"),
    "targets:\n  claude:\n    carrier: plugin\n",
  );

  const result = await applyProject(scope);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  const claudeRoot = path.join(scope.cwd, ".claude");
  // The sidecar records on-disk modes, which follow the umask for the inventory file.
  const { ".acf-managed.json": sidecar, ...files } = await filesUnder(claudeRoot);
  if (typeof sidecar !== "string") throw new Error("apply wrote no sidecar");
  const managed = JSON.parse(sidecar) as { managed: { path: string; carrier: string }[] };
  expect(managed.managed.map((entry) => [entry.path, entry.carrier])).toEqual([
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

  const again = await applyProject(scope);
  expect(again.exitCode).toBe(0);
  expect(await filesUnder(claudeRoot)).toEqual({ ".acf-managed.json": sidecar, ...files });

  await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
  expect((await applyProject(scope)).exitCode).toBe(0);
  await expect(
    stat(path.join(claudeRoot, ".acf", "marketplace", "plugins", "review")),
  ).rejects.toThrow();
});
