import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

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

test("caplet preserves concise scalar and list capability selectors when rewriting", async () => {
  const scope = await makeScope();
  try {
    const manifestPath = path.join(scope.home, ".agents", "capabilities.yml");
    await Bun.write(
      manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${scope.sourceRoot}\n    capabilities: alpha\n`,
    );
    const result = await runCaplet(scope, [
      "add",
      `path:${scope.sourceRoot}`,
      "--path",
      "beta",
      "--no-apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(result.exitCode).toBe(0);
    expect(await readText(manifestPath)).toContain("capabilities: alpha");

    await Bun.write(
      manifestPath,
      `acf: 1\ncapabilities:\n  - source: path:${scope.sourceRoot}\n    capabilities: [alpha, beta]\n`,
    );
    const listResult = await runCaplet(scope, [
      "add",
      `path:${scope.sourceRoot}`,
      "--path",
      "alpha",
      "--no-apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(listResult.exitCode).toBe(0);
    const rewritten = await readText(manifestPath);
    expect(rewritten).toContain("capabilities:");
    expect(rewritten).toContain("  - alpha");
    expect(rewritten).toContain("  - beta");
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
      "--no-apply",
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
      "--no-apply",
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
      "--no-apply",
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

test("caplet add github source without --ref suggests --ref main", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "add",
      "github:owner/repo",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Git and github sources require --ref");
    expect(result.stderr).toContain("try: caplet add github:owner/repo --ref main");
  } finally {
    await cleanup(scope);
  }
});

test("caplet add imports every bare skill as a synthesized capability non-interactively", async () => {
  const scope = await makeScope();
  try {
    const bare = path.join(scope.sourceRoot, "bare-skills");
    await writeText(
      path.join(bare, "skills", "one", "SKILL.md"),
      "---\nname: one\ndescription: One\n---\nOne.\n",
    );
    await writeText(path.join(bare, "skills", "one", "references", "guide.md"), "Guide.\n");
    await writeText(
      path.join(bare, "skills", "two", "SKILL.md"),
      "---\nname: two\ndescription: Two\n---\nTwo.\n",
    );

    const result = await runCaplet(scope, [
      "add",
      `path:${bare}`,
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Capabilities  one, two");
    const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
    expect(manifest).not.toContain("capabilities: [");
    const lock = JSON.parse(await readText(path.join(scope.agentsDir, "capabilities.lock")));
    const imported = lock.entries.find((entry: { synthesized?: boolean }) => entry.synthesized);
    expect(imported?.capabilityNames).toEqual(["one", "two"]);
    expect(imported?.synthesized).toBe(true);
    expect(await Bun.file(path.join(scope.agentsDir, "skills", "one", "SKILL.md")).exists()).toBe(
      true,
    );
    expect(
      await Bun.file(
        path.join(scope.agentsDir, "skills", "one", "references", "guide.md"),
      ).exists(),
    ).toBe(true);
    expect(await Bun.file(path.join(scope.agentsDir, "skills", "two", "SKILL.md")).exists()).toBe(
      true,
    );
  } finally {
    await cleanup(scope);
  }
});
