import { expect, test } from "bun:test";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, runCaplet, writeText } from "../helpers";

const binaryBytes = Uint8Array.from([0, 255, 1, 128, 10, 42]);

async function expectAssetTree(root: string): Promise<void> {
  expect([...(await readFile(path.join(root, "assets", "blob.bin")))]).toEqual([...binaryBytes]);
  expect(await readFile(path.join(root, "scripts", "run.sh"), "utf8")).toBe(
    "#!/bin/sh\nprintf 'caplet asset\\n'\n",
  );
  expect((await stat(path.join(root, "scripts", "run.sh"))).mode & 0o777).toBe(0o755);
}

test("caplet apply preserves binary skill assets and executable modes for Pi", async () => {
  const scope = await makeScope();
  try {
    const source = path.join(scope.sourceRoot, "binary-assets");
    const skill = path.join(source, "skills", "asset-demo");
    await mkdir(path.join(skill, "assets"), { recursive: true });
    await mkdir(path.join(skill, "scripts"), { recursive: true });
    await writeText(
      path.join(source, "acf.yml"),
      "acf: 1\nname: binary-assets\nversion: 1.0.0\ndescription: Binary transport fixture\n",
    );
    await writeText(
      path.join(skill, "SKILL.md"),
      [
        "---",
        "name: asset-demo",
        "description: Exercise byte-safe skill transport",
        "assets:",
        "  - assets/blob.bin",
        "  - scripts/run.sh",
        "---",
        "Run the packaged script.",
        "",
      ].join("\n"),
    );
    await writeFile(path.join(skill, "assets", "blob.bin"), binaryBytes);
    await writeText(path.join(skill, "scripts", "run.sh"), "#!/bin/sh\nprintf 'caplet asset\\n'\n");
    await chmod(path.join(skill, "scripts", "run.sh"), 0o755);

    const added = await runCaplet(scope, [
      "add",
      `path:${source}`,
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
    ]);
    expect(added.exitCode).toBe(0);
    await writeText(
      path.join(scope.home, ".agents", "caplet.yml"),
      "targets:\n  pi:\n    skills:\n      native: true\n",
    );

    const applied = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
      "--target",
      "pi",
      "--mode",
      "force",
      "--fail-on-lossy",
    ]);
    expect(applied.exitCode).toBe(0);

    await expectAssetTree(
      path.join(scope.home, ".agents", "capabilities", "binary-assets", "skills", "asset-demo"),
    );
    await expectAssetTree(path.join(scope.home, ".agents", "skills", "asset-demo"));
    await expectAssetTree(path.join(scope.home, ".pi", "agent", "skills", "asset-demo"));

    const cleanDiff = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
      "--target",
      "pi",
    ]);
    expect(cleanDiff.exitCode).toBe(0);
    expect(cleanDiff.stdout).toContain("Everything up to date");

    const canonicalScript = path.join(
      scope.home,
      ".agents",
      "skills",
      "asset-demo",
      "scripts",
      "run.sh",
    );
    await chmod(canonicalScript, 0o644);
    const modeDiff = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
      "--target",
      "pi",
    ]);
    expect(modeDiff.stdout).toMatch(/~ .*run\.sh/);

    const repaired = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
      "--target",
      "pi",
      "--mode",
      "never",
    ]);
    expect(repaired.exitCode).toBe(0);
    expect((await stat(canonicalScript)).mode & 0o777).toBe(0o755);
  } finally {
    await cleanup(scope);
  }
});
