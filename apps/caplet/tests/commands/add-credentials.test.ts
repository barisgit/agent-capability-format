import { afterEach, beforeEach, expect, test } from "bun:test";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, runCaplet, type TestScope } from "../helpers";

const SECRET = "abc";
let scope: TestScope;

beforeEach(async () => {
  scope = await makeScope();
});

afterEach(async () => {
  await cleanup(scope);
});

async function filesContaining(dir: string, needle: string): Promise<string[]> {
  const hits: string[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    // Bun's transpiler cache under the test HOME holds compiled source, not caplet output.
    if (file.includes(`${path.sep}.bun${path.sep}`)) continue;
    if ((await readFile(file, "utf8")).includes(needle)) hits.push(file);
  }
  return hits;
}

for (const source of [
  `git:https://x-access-token:${SECRET}@github.com/o/r`,
  `git:https://github.com/o/r.git?token=${SECRET}`,
]) {
  test(`caplet add rejects ${source} without writing or printing the secret`, async () => {
    const manifest = await readFile(path.join(scope.agentsDir, "capabilities.yml"), "utf8");

    const result = await runCaplet(scope, [
      "add",
      source,
      "--ref",
      "main",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("credential");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
    expect(await readFile(path.join(scope.agentsDir, "capabilities.yml"), "utf8")).toBe(manifest);
    expect(await filesContaining(scope.dir, SECRET)).toEqual([]);
  });
}

test("apply rejects a credential-bearing source already in capabilities.yml", async () => {
  await writeFile(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: git:https://github.com/o/r.git?access_token=${SECRET}\n    ref: main\n`,
  );

  const result = await runCaplet(scope, ["apply", "--cwd", scope.cwd, "--scope", "project"]);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain("acf.source.credential-in-url");
  expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  const written = await filesContaining(scope.dir, SECRET);
  expect(written).toEqual([path.join(scope.agentsDir, "capabilities.yml")]);
});
