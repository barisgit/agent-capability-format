import path from "node:path";
import { expect, test } from "bun:test";
import { applyProject, cleanup, makeScope, readText, writeText } from "../helpers";

test("caplet apply fetches and writes native artifacts", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research skill\n---\nUse structured research notes.\n",
    );
    const result = await applyProject(scope);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("DONE  Applied 6 files");
    expect(await readText(path.join(scope.cwd, ".claude", "CLAUDE.md"))).toContain("Alpha guidance");
    expect(await Bun.file(path.join(scope.cwd, ".claude", ".acf-managed.json")).exists()).toBe(true);
    const canonicalSidecar = await readText(path.join(scope.agentsDir, ".acf-managed.json"));
    expect(canonicalSidecar).toContain("skills/research/SKILL.md");
    expect(canonicalSidecar).not.toContain("../");
  } finally {
    await cleanup(scope);
  }
});
