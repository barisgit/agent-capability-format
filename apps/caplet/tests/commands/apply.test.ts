import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
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

/** A user-invocable-false skill, which Claude carries natively and Codex refuses. */
const manualOnlySkill = (extra = "") =>
  `---\nname: background\ndescription: House conventions\ninvocation:\n  user: false\n${extra}---\nConventions.\n`;

test("a refusal blocks its capability for that target until the component is excluded", async () => {
  const scope = await makeScope();
  try {
    const alpha = path.join(scope.sourceRoot, "alpha");
    await writeText(path.join(alpha, "skills", "background", "SKILL.md"), manualOnlySkill());
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

    const preview = await runCaplet(scope, [...args, "--dry-run", "--json"]);

    expect(preview.exitCode).toBe(2);
    expect((JSON.parse(preview.stdout) as { ok: boolean }).ok).toBe(false);

    const refused = await runCaplet(scope, args);

    expect(refused.exitCode).toBe(2);
    expect(refused.stderr).toContain("acf.support.refused");
    expect(refused.stdout).toContain(
      "background (alpha-cap) / codex - blocked: skill background is not installed for codex",
    );
    expect(refused.stdout).toContain(
      "review, alpha-helper, always, alpha-server (alpha-cap) / codex - blocked: capability alpha-cap is not installed for codex (skill background). Recovery: exclude: { skills: [background] } or except: [codex]",
    );
    expect(await exists(".claude", "skills", "background", "SKILL.md")).toBe(true);
    expect(await exists(".claude", "skills", "review", "SKILL.md")).toBe(true);
    expect(await exists(".claude", "agents", "alpha-helper.md")).toBe(true);
    expect(await exists(".agents", "skills", "review")).toBe(false);
    expect(await exists(".agents", "skills", "background")).toBe(false);
    expect(await exists(".codex", "agents", "alpha-helper.md")).toBe(false);
    expect(await exists(".codex", "agents", "beta-helper.md")).toBe(true);
    const config = await readText(path.join(scope.cwd, ".codex", "config.toml"));
    expect(config).toContain("beta-server");
    expect(config).not.toContain("alpha-server");

    await writeText(
      path.join(alpha, "skills", "background", "SKILL.md"),
      manualOnlySkill("except: [codex]\n"),
    );
    const recovered = await runCaplet(scope, [...args, "--mode", "force"]);

    expect(recovered.exitCode).toBe(0);
    expect(recovered.stdout).not.toContain("blocked");
    expect(await exists(".agents", "skills", "review", "SKILL.md")).toBe(true);
    expect(await exists(".agents", "skills", "background")).toBe(false);
    expect(await exists(".codex", "agents", "alpha-helper.md")).toBe(true);
    expect(await readText(path.join(scope.cwd, ".codex", "config.toml"))).toContain("alpha-server");
  } finally {
    await cleanup(scope);
  }
});

test("the exclude recovery a refusal names unblocks the capability", async () => {
  const scope = await makeScope();
  try {
    const alpha = path.join(scope.sourceRoot, "alpha");
    await writeText(path.join(alpha, "skills", "background", "SKILL.md"), manualOnlySkill());
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
    expect(refused.stdout).toContain(
      "Recovery: exclude: { skills: [background] } or except: [codex]",
    );
    expect(await exists(".claude", "skills", "background", "SKILL.md")).toBe(true);

    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${alpha}\n    exclude: { skills: [background] }\n  - source: path:${path.join(scope.sourceRoot, "beta")}\n`,
    );
    const recovered = await runCaplet(scope, args);

    expect(recovered.stderr).not.toContain("acf.support.refused");
    expect(recovered.exitCode).toBe(0);
    expect(recovered.stdout).not.toContain("blocked");
    expect(await exists(".agents", "skills", "review", "SKILL.md")).toBe(true);
    expect(await exists(".agents", "skills", "background")).toBe(false);
    expect(await exists(".claude", "skills", "background")).toBe(false);
    expect(await exists(".claude", "skills", "review", "SKILL.md")).toBe(true);
    expect(await exists(".codex", "agents", "alpha-helper.md")).toBe(true);
    expect(await readText(path.join(scope.cwd, ".codex", "config.toml"))).toContain("alpha-server");
    expect(await readText(path.join(scope.agentsDir, "capabilities.lock"))).toContain("background");
  } finally {
    await cleanup(scope);
  }
});

test("the except recovery a refusal names keeps the capability off that target", async () => {
  const scope = await makeScope();
  try {
    const alpha = path.join(scope.sourceRoot, "alpha");
    await writeText(path.join(alpha, "skills", "background", "SKILL.md"), manualOnlySkill());
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "emit:\n  defaultTargets: [claude, codex]\n",
    );
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${alpha}\n    except: [codex]\n  - source: path:${path.join(scope.sourceRoot, "beta")}\n`,
    );
    const exists = (...parts: string[]) => Bun.file(path.join(scope.cwd, ...parts)).exists();

    const result = await runCaplet(scope, ["apply", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.stderr).not.toContain("acf.support.refused");
    expect(result.exitCode).toBe(0);
    expect(await exists(".claude", "skills", "background", "SKILL.md")).toBe(true);
    expect(await exists(".claude", "agents", "alpha-helper.md")).toBe(true);
    expect(await exists(".codex", "agents", "alpha-helper.md")).toBe(false);
    expect(await exists(".codex", "agents", "beta-helper.md")).toBe(true);
    expect(await readText(path.join(scope.cwd, ".codex", "config.toml"))).not.toContain(
      "alpha-server",
    );
  } finally {
    await cleanup(scope);
  }
});

test("a capability that gains a refused skill keeps its earlier output for that target", async () => {
  const scope = await makeScope();
  try {
    const alpha = path.join(scope.sourceRoot, "alpha");
    const skill = (name: string, body: string) =>
      writeText(
        path.join(alpha, "skills", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill\n---\n${body}\n`,
      );
    await skill("review", "Review.");
    await skill("old", "Old.");
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "emit:\n  defaultTargets: [claude, codex]\n",
    );
    const args = ["apply", "--cwd", scope.cwd, "--scope", "project"];
    const file = (...parts: string[]) => path.join(scope.cwd, ...parts);
    const exists = (...parts: string[]) => Bun.file(file(...parts)).exists();
    expect((await runCaplet(scope, args)).exitCode).toBe(0);
    const codexFiles = [
      [".agents", "skills", "review", "SKILL.md"],
      [".agents", "skills", "old", "SKILL.md"],
      [".codex", "agents", "alpha-helper.md"],
      [".codex", "config.toml"],
      [".codex", ".acf-managed.json"],
      [".agents", ".acf-managed.json"],
    ];
    const before = await Promise.all(codexFiles.map((parts) => readText(file(...parts))));

    await writeText(path.join(alpha, "skills", "background", "SKILL.md"), manualOnlySkill());
    await skill("review", "Review carefully.");
    await rm(path.join(alpha, "skills", "old"), { recursive: true });
    await writeText(
      path.join(alpha, "agents", "alpha-helper.md"),
      "---\nname: alpha-helper\ndescription: Helper alpha-cap\n---\nChanged help.\n",
    );
    const blocked = await runCaplet(scope, [...args, "--mode", "force", "--yes"]);

    expect(blocked.exitCode).toBe(2);
    expect(blocked.stderr).toContain("acf.support.refused");
    expect(await Promise.all(codexFiles.map((parts) => readText(file(...parts))))).toEqual(before);
    expect(await readText(file(".claude", "skills", "review", "SKILL.md"))).toContain(
      "Review carefully.",
    );
    expect(await exists(".claude", "skills", "background", "SKILL.md")).toBe(true);
    expect(await exists(".claude", "skills", "old")).toBe(false);

    const again = await runCaplet(scope, args);

    expect(again.exitCode).toBe(2);
    expect(again.stdout).toContain("Compatibility");
    expect(again.stdout).toContain("background (alpha-cap) / codex - blocked:");
    expect(again.stdout).not.toContain("Everything up to date");
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
