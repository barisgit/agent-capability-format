import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

for (const mapping of [false, true]) {
  test(`rename updates materialized capability identity (${mapping ? "mapping" : "scalar"}) without renaming facets`, async () => {
    const scope = await makeScope();
    try {
      const source = path.join(scope.sourceRoot, "renamed");
      await writeText(path.join(source, "acf.yml"), "acf: 1\nname: alpha-cap\nversion: 1.0.0\n");
      await writeText(
        path.join(source, "skills", "original", "SKILL.md"),
        "---\nname: original\ndescription: Original\n---\nBody\n",
      );
      const manifest = path.join(scope.agentsDir, "capabilities.yml");
      if (mapping) {
        await writeText(
          manifest,
          `${await readText(manifest)}  - source: path:${source}\n    rename:\n      alpha-cap: renamed-cap\n`,
        );
      }
      const result = await runCaplet(
        scope,
        mapping
          ? ["apply", "--cwd", scope.cwd, "--scope", "project", "--target", "codex"]
          : [
              "add",
              source,
              "--as",
              "renamed-cap",
              "--cwd",
              scope.cwd,
              "--scope",
              "project",
              "--target",
              "codex",
            ],
      );
      expect(result.exitCode).toBe(0);
      expect(
        await readText(path.join(scope.agentsDir, "capabilities", "renamed-cap", "acf.yml")),
      ).toContain("name: renamed-cap");
      expect(
        await Bun.file(
          path.join(
            scope.agentsDir,
            "capabilities",
            "renamed-cap",
            "skills",
            "original",
            "SKILL.md",
          ),
        ).exists(),
      ).toBe(true);
      expect(await readText(path.join(scope.agentsDir, "capabilities.lock"))).toContain(
        '"renamed-cap"',
      );
      const check = await runCaplet(scope, [
        "check",
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        "--target",
        "codex",
      ]);
      expect(check.exitCode).toBe(0);
      const shown = await runCaplet(scope, [
        "show",
        "renamed-cap",
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        "--json",
      ]);
      expect(shown.exitCode).toBe(0);
      expect(shown.stdout).toContain('"name": "renamed-cap"');
      const sidecar = await readText(path.join(scope.agentsDir, ".acf-managed.json"));
      expect(sidecar).toContain('"capability": "renamed-cap"');
      const removed = await runCaplet(scope, [
        "remove",
        "renamed-cap",
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        "--target",
        "codex",
        "--yes",
      ]);
      expect(removed.exitCode).toBe(0);
      expect(await readText(path.join(scope.agentsDir, "capabilities.lock"))).not.toContain(
        '"renamed-cap"',
      );
      expect(
        await Bun.file(path.join(scope.agentsDir, "skills", "original", "SKILL.md")).exists(),
      ).toBe(false);
    } finally {
      await cleanup(scope);
    }
  });
}

test("add --as refuses a multi-capability selection before changing the manifest", async () => {
  const scope = await makeScope();
  try {
    const source = path.join(scope.sourceRoot, "multi");
    for (const name of ["one", "two"]) {
      await writeText(
        path.join(source, "skills", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Skill\n---\nBody\n`,
      );
    }
    const manifest = path.join(scope.agentsDir, "capabilities.yml");
    const before = await readText(manifest);
    const result = await runCaplet(scope, [
      "add",
      source,
      "--as",
      "both",
      "--no-apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("exactly one capability");
    expect(await readText(manifest)).toBe(before);
  } finally {
    await cleanup(scope);
  }
});

test("renaming an imported bare skill changes only its capability identity", async () => {
  const scope = await makeScope();
  try {
    const source = path.join(scope.sourceRoot, "bare");
    await writeText(
      path.join(source, "SKILL.md"),
      "---\nname: original\ndescription: Original\n---\nBody\n",
    );
    const result = await runCaplet(scope, [
      "add",
      source,
      "--as",
      "renamed-skill",
      "--cwd",
      scope.cwd,
      "--scope",
      "user",
      "--target",
      "codex",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Capabilities  renamed-skill");
    const root = path.join(scope.home, ".agents", "capabilities", "renamed-skill");
    expect(await readText(path.join(root, "acf.yml"))).toContain("name: renamed-skill");
    expect(await Bun.file(path.join(root, "skills", "original", "SKILL.md")).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});
