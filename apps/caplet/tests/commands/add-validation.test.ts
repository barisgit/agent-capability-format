import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

test("add rejects extra sources before writing anything", async () => {
  const scope = await makeScope();
  try {
    const manifest = path.join(scope.agentsDir, "capabilities.yml");
    const before = await readText(manifest);
    const source = path.join(scope.sourceRoot, "new");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: new\nversion: 1.0.0\n");
    const result = await runCaplet(scope, [
      "add",
      source,
      path.join(scope.sourceRoot, "beta"),
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics[0].code).toBe("acf.cli.usage");
    expect(await readText(manifest)).toBe(before);
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities.lock")).exists()).toBe(false);
  } finally {
    await cleanup(scope);
  }
});

test("add rejects invalid --as before writing anything", async () => {
  const scope = await makeScope();
  try {
    const manifest = path.join(scope.agentsDir, "capabilities.yml");
    const before = await readText(manifest);
    const source = path.join(scope.sourceRoot, "new");
    await writeText(path.join(source, "acf.yml"), "acf: 1\nname: new\nversion: 1.0.0\n");
    const result = await runCaplet(scope, [
      "add",
      source,
      "--as",
      "MyCap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Invalid --as");
    expect(await readText(manifest)).toBe(before);
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities.lock")).exists()).toBe(false);
  } finally {
    await cleanup(scope);
  }
});

test("add restores the exact manifest on resolution failure", async () => {
  const scope = await makeScope();
  try {
    const duplicate = path.join(scope.sourceRoot, "duplicate");
    await writeText(path.join(duplicate, "acf.yml"), "acf: 1\nname: alpha-cap\nversion: 1.0.0\n");
    const manifest = path.join(scope.agentsDir, "capabilities.yml");
    const before = await readText(manifest);
    const result = await runCaplet(scope, [
      "add",
      duplicate,
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(2);
    expect(await readText(manifest)).toBe(before);
  } finally {
    await cleanup(scope);
  }
});
