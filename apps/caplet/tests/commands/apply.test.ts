import { expect, test } from "bun:test";
import path from "node:path";
import {
  applyProject,
  cleanup,
  forceCanonicalSkills,
  makeScope,
  readText,
  runCaplet,
  writeText,
} from "../helpers";

test("a refused skill is left out for one target while the rest applies and apply exits non-zero", async () => {
  const scope = await makeScope();
  try {
    const alpha = path.join(scope.sourceRoot, "alpha");
    const manualOnly = (except: string) =>
      `---\nname: background\ndescription: House conventions\ninvocation:\n  user: false\n${except}---\nConventions.\n`;
    await writeText(path.join(alpha, "skills", "background", "SKILL.md"), manualOnly(""));
    await writeText(
      path.join(alpha, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review a change\n---\nReview.\n",
    );
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "emit:\n  defaultTargets: [claude, codex]\n",
    );
    const args = ["apply", "--cwd", scope.cwd, "--scope", "project"];

    const exists = (...parts: string[]) => Bun.file(path.join(scope.cwd, ...parts)).exists();

    const refused = await runCaplet(scope, args);

    expect(refused.exitCode).toBe(2);
    expect(refused.stdout).toContain("background (alpha-cap) / codex - blocked:");
    expect(refused.stderr).toContain("acf.support.refused");
    expect(await exists(".claude", "skills", "background", "SKILL.md")).toBe(true);
    expect(await exists(".claude", "skills", "review", "SKILL.md")).toBe(true);
    expect(await exists(".agents", "skills", "review", "SKILL.md")).toBe(true);
    expect(await exists(".agents", "skills", "background")).toBe(false);

    await writeText(
      path.join(alpha, "skills", "background", "SKILL.md"),
      manualOnly("except: [codex]\n"),
    );
    const recovered = await runCaplet(scope, [...args, "--mode", "force"]);

    expect(recovered.exitCode).toBe(0);
    expect(recovered.stdout).not.toContain("blocked");
  } finally {
    await cleanup(scope);
  }
});

test("targeted apply preserves other targets in a shared-root inventory", async () => {
  const scope = await makeScope();
  try {
    await forceCanonicalSkills(scope);
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "codex-only", "SKILL.md"),
      "---\nname: codex-only\ndescription: Codex-only skill\nonly: [codex]\n---\nUse Codex.\n",
    );
    const codex = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "codex",
    ]);
    expect(codex.exitCode).toBe(0);
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "claude-only", "SKILL.md"),
      "---\nname: claude-only\ndescription: Claude-only skill\nonly: [claude]\n---\nUse Claude.\n",
    );

    const claude = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
      "--mode",
      "force",
    ]);

    expect(claude.exitCode).toBe(0);
    const inventory = await readText(path.join(scope.agentsDir, "ACF-MANAGED.md"));
    expect(inventory).toContain("`skills/codex-only/`");
    expect(inventory).toContain("`skills/claude-only/`");
  } finally {
    await cleanup(scope);
  }
});

test("caplet refuses to overwrite an unowned install-root management notice", async () => {
  const scope = await makeScope();
  try {
    const noticePath = path.join(scope.cwd, ".claude", "ACF-MANAGED.md");
    await writeText(noticePath, "hand-authored notice\n");

    const result = await applyProject(scope);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("acf.emit.managed-notice-destination-collision");
    expect(await readText(noticePath)).toBe("hand-authored notice\n");
  } finally {
    await cleanup(scope);
  }
});

test("caplet detects and repairs management notice drift", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research skill\n---\nUse structured research notes.\n",
    );
    expect((await applyProject(scope)).exitCode).toBe(0);
    const rootNotice = path.join(scope.cwd, ".claude", "ACF-MANAGED.md");
    const localNotice = path.join(scope.cwd, ".claude", "skills", "research", "ACF-MANAGED.md");
    const expectedRoot = await readText(rootNotice);
    const expectedLocal = await readText(localNotice);
    await writeText(rootNotice, "drifted root\n");
    await writeText(localNotice, "drifted local\n");

    const diff = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(diff.exitCode).toBe(0);
    expect(diff.stdout).toContain("managed notices");
    expect((await applyProject(scope)).exitCode).toBe(0);
    expect(await readText(rootNotice)).toBe(expectedRoot);
    expect(await readText(localNotice)).toBe(expectedLocal);
  } finally {
    await cleanup(scope);
  }
});

test("caplet apply fetches and writes native artifacts", async () => {
  const scope = await makeScope();
  try {
    await forceCanonicalSkills(scope);
    await writeText(
      path.join(scope.sourceRoot, "alpha", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research skill\n---\nUse structured research notes.\n",
    );
    const result = await applyProject(scope);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Applied 10 files");
    expect(await readText(path.join(scope.cwd, ".claude", "CLAUDE.md"))).toContain(
      "Alpha guidance",
    );
    expect(await Bun.file(path.join(scope.cwd, ".claude", ".acf-managed.json")).exists()).toBe(
      true,
    );
    const canonicalSidecar = await readText(path.join(scope.agentsDir, ".acf-managed.json"));
    expect(canonicalSidecar).toContain("skills/research/SKILL.md");
    expect(canonicalSidecar).not.toContain("../");
    const canonicalInventory = await readText(path.join(scope.agentsDir, "ACF-MANAGED.md"));
    expect(canonicalInventory).toContain("This install root is shared");
    expect(canonicalInventory).toContain("`skills/research/` (skill `research` directory)");
    expect(
      await readText(path.join(scope.agentsDir, "skills", "research", "ACF-MANAGED.md")),
    ).toContain("Owning capability: `alpha-cap`");
    expect(await readText(path.join(scope.cwd, ".claude", "ACF-MANAGED.md"))).toContain(
      "`agents/alpha-helper.md` (whole file)",
    );
    expect(
      await readText(path.join(scope.cwd, ".claude", "skills", "research", "ACF-MANAGED.md")),
    ).toContain("Owning capability: `alpha-cap`");
    expect(
      await Bun.file(
        path.join(
          scope.agentsDir,
          "capabilities",
          "alpha-cap",
          "skills",
          "research",
          "ACF-MANAGED.md",
        ),
      ).exists(),
    ).toBe(false);
  } finally {
    await cleanup(scope);
  }
});
