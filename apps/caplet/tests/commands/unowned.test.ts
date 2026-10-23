import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

const skill = "---\nname: three\ndescription: Three\n---\nGenerated guidance.\n";

test("apply conflicts with unowned output, adopts identical bytes, and recovers safely from sidecar loss", async () => {
  const scope = await makeScope();
  try {
    await writeText(path.join(scope.sourceRoot, "alpha", "skills", "three", "SKILL.md"), skill);
    const output = path.join(scope.agentsDir, "skills", "three", "SKILL.md");
    await writeText(output, "Hand authored.\n");
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "codex", "--json"];
    const conflict = await runCaplet(scope, ["apply", ...args]);
    expect(conflict.exitCode).toBe(2);
    const envelope = JSON.parse(conflict.stdout);
    expect(envelope.diagnostics).toContainEqual(
      expect.objectContaining({ code: "acf.apply.unowned", path: output }),
    );
    expect(envelope.plan.changes).toContainEqual(
      expect.objectContaining({ path: ".agents/skills/three/SKILL.md", action: "conflict" }),
    );
    expect(await readText(output)).toBe("Hand authored.\n");
    expect(
      await Bun.file(path.join(scope.cwd, ".codex", "agents", "alpha-helper.md")).exists(),
    ).toBe(false);
    await rm(output);
    expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
    const generated = await readText(output);
    // Losing the sidecar allows only byte-identical adoption, never replacement.
    await rm(path.join(scope.agentsDir, ".acf-managed.json"));
    expect((await runCaplet(scope, ["apply", ...args])).exitCode).toBe(0);
    expect(await readText(path.join(scope.agentsDir, ".acf-managed.json"))).toContain(
      "skills/three/SKILL.md",
    );
    await rm(path.join(scope.agentsDir, ".acf-managed.json"));
    await writeText(output, `${generated}\nMy edits.\n`);
    const lost = await runCaplet(scope, ["apply", ...args]);
    expect(lost.exitCode).toBe(2);
    expect(lost.stdout).toContain("move or delete");
    expect(await readText(output)).toBe(`${generated}\nMy edits.\n`);
  } finally {
    await cleanup(scope);
  }
});

test("identical unlocked capability snapshots can be adopted", async () => {
  const scope = await makeScope();
  try {
    const args = ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project", "--json"];
    expect((await runCaplet(scope, args)).exitCode).toBe(0);
    await rm(path.join(scope.agentsDir, "capabilities.lock"));
    expect((await runCaplet(scope, args)).exitCode).toBe(0);
    expect(await readText(path.join(scope.agentsDir, "capabilities.lock"))).toContain("alpha-cap");
  } finally {
    await cleanup(scope);
  }
});

test("a new source cannot replace an unlocked hand-authored capability directory", async () => {
  const scope = await makeScope();
  try {
    const marker = path.join(scope.agentsDir, "capabilities", "alpha-cap", "mine.txt");
    await writeText(marker, "Keep my capability");
    const result = await runCaplet(scope, [
      "update",
      "--no-apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "acf.apply.unowned", path: path.dirname(marker) }),
    );
    expect(await readText(marker)).toBe("Keep my capability");
    expect(await Bun.file(path.join(scope.agentsDir, "capabilities.lock")).exists()).toBe(false);
  } finally {
    await cleanup(scope);
  }
});
