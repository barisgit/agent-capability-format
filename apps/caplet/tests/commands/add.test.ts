import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet } from "../helpers";

test("caplet add writes a source that fetch can resolve", async () => {
  const scope = await makeScope();
  try {
    const source = `path:${path.join(scope.sourceRoot, "alpha")}`;
    const result = await runCaplet(scope, [
      "add",
      source,
      "--rename",
      "alpha-copy",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(result.exitCode).toBe(0);
    const manifest = await readText(path.join(scope.home, ".agents", "capabilities.yml"));
    expect(manifest).toContain(`source: ${source}`);
    expect(manifest).not.toContain("kind: path");
    expect(manifest).not.toContain("location:");
    expect(manifest).toContain("alpha-copy");
    expect(manifest).toContain(scope.sourceRoot);

    const fetched = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "user"]);
    expect(fetched.exitCode).toBe(0);
    expect(
      await Bun.file(
        path.join(scope.home, ".agents", "capabilities", "alpha-copy", "acf.yml"),
      ).exists(),
    ).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("caplet add --path resolves a capability below a source root", async () => {
  const scope = await makeScope();
  try {
    const source = `path:${scope.sourceRoot}`;
    const added = await runCaplet(scope, [
      "add",
      source,
      "--path",
      "alpha",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(added.exitCode).toBe(0);
    const addedBeta = await runCaplet(scope, [
      "add",
      source,
      "--path",
      "beta",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(addedBeta.exitCode).toBe(0);
    const duplicate = await runCaplet(scope, [
      "add",
      source,
      "--path",
      "alpha",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(duplicate.exitCode).not.toBe(0);

    const manifest = await readText(path.join(scope.home, ".agents", "capabilities.yml"));
    expect(manifest.match(new RegExp(`source: ${source}`, "g"))).toHaveLength(2);
    expect(manifest).not.toContain("kind: path");
    expect(manifest).toContain("path: alpha");
    expect(manifest).toContain("path: beta");

    const fetched = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "user"]);
    expect(fetched.exitCode).toBe(0);
    expect(
      await Bun.file(
        path.join(scope.home, ".agents", "capabilities", "alpha-cap", "acf.yml"),
      ).exists(),
    ).toBe(true);
    expect(
      await Bun.file(
        path.join(scope.home, ".agents", "capabilities", "beta-cap", "acf.yml"),
      ).exists(),
    ).toBe(true);
    const lock = JSON.parse(
      await readText(path.join(scope.home, ".agents", "capabilities.lock")),
    ) as { entries: Array<{ sourceId: string }> };
    expect(lock.entries.map((entry) => entry.sourceId).sort()).toEqual([
      `${source}#path=alpha`,
      `${source}#path=beta`,
    ]);
  } finally {
    await cleanup(scope);
  }
});
