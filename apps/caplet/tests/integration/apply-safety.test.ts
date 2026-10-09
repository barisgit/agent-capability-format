import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyEmitPlan, buildEmitPlan } from "../../src/internal/workflow";
import {
  applyProject,
  cleanup,
  forceCanonicalSkills,
  makeScope,
  readText,
  runCaplet,
  type TestScope,
  writeText,
} from "../helpers";

let scope: TestScope;
const saved = { cwd: process.cwd(), home: process.env.HOME };

beforeEach(async () => {
  scope = await makeScope();
  await forceCanonicalSkills(scope);
  // In-process plans resolve scopes through os.homedir(); never touch the real home.
  process.env.HOME = scope.home;
});

afterEach(async () => {
  process.chdir(saved.cwd);
  if (saved.home === undefined) delete process.env.HOME;
  else process.env.HOME = saved.home;
  await cleanup(scope);
});

const planArgs = (): Record<string, unknown> => ({
  cwd: scope.cwd,
  scope: "project",
  target: "claude",
});

async function writeSkill(name: string, files: Record<string, string> = {}): Promise<void> {
  const root = path.join(scope.sourceRoot, "alpha", "skills", name);
  await writeText(
    path.join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: Skill ${name}\n---\nUse ${name}.\n${Object.keys(files)
      .map((file) => `See [${file}](${file}).\n`)
      .join("")}`,
  );
  for (const [file, text] of Object.entries(files)) await writeText(path.join(root, file), text);
}

/** Applies after re-reading path sources, which plain `apply` serves from the locked snapshot. */
async function reapply(): Promise<number> {
  const result = await runCaplet(scope, [
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
  return result.exitCode;
}

async function sidecarPaths(installRoot: string): Promise<string[]> {
  const sidecar = JSON.parse(await readText(path.join(installRoot, ".acf-managed.json"))) as {
    managed: Array<{ path: string }>;
  };
  return sidecar.managed.map((entry) => entry.path);
}

test("a file edited between plan and apply is left unchanged and reported as drift", async () => {
  expect((await applyProject(scope)).exitCode).toBe(0);
  const agentPath = path.join(scope.cwd, ".claude", "agents", "alpha-helper.md");
  await writeText(
    path.join(scope.sourceRoot, "alpha", "agents", "alpha-helper.md"),
    "---\nname: alpha-helper\ndescription: Helper alpha-cap\n---\nNew help.\n",
  );
  expect(
    (await runCaplet(scope, ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project"]))
      .exitCode,
  ).toBe(0);
  const plan = await buildEmitPlan(planArgs());
  expect(plan.diffs.some((item) => item.diff.path === agentPath)).toBe(true);

  await writeText(agentPath, "user edit\n");
  const summary = await applyEmitPlan(plan);

  expect(await readText(agentPath)).toBe("user edit\n");
  const drift = summary.diagnostics.filter((item) => item.code === "acf.apply.drift");
  expect(drift.map((item) => item.path)).toEqual([agentPath]);
  expect(drift[0]?.severity).toBe("warn");
});

test("a planned delete of a file edited before apply keeps the file and its ownership", async () => {
  expect((await applyProject(scope)).exitCode).toBe(0);
  await writeFile(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, "alpha")}\n`,
    "utf8",
  );
  const betaAgent = path.join(scope.cwd, ".claude", "agents", "beta-helper.md");
  const plan = await buildEmitPlan(planArgs());
  expect(plan.diffs.some((item) => item.diff.path === betaAgent && item.diff.after === null)).toBe(
    true,
  );

  await writeText(betaAgent, "user edit\n");
  const summary = await applyEmitPlan(plan);

  expect(await readText(betaAgent)).toBe("user edit\n");
  expect(summary.diagnostics.some((item) => item.code === "acf.apply.drift")).toBe(true);
  expect(await sidecarPaths(path.join(scope.cwd, ".claude"))).toContain("agents/beta-helper.md");
});

test("deselecting a capability keeps an output file the user edited and reports drift", async () => {
  expect((await applyProject(scope)).exitCode).toBe(0);
  const claudeRoot = path.join(scope.cwd, ".claude");
  const betaAgent = path.join(claudeRoot, "agents", "beta-helper.md");
  await writeText(betaAgent, "user edit\n");
  await writeFile(
    path.join(scope.agentsDir, "capabilities.yml"),
    `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, "alpha")}\n`,
    "utf8",
  );

  const result = await runCaplet(scope, [
    "apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
    "--json",
  ]);

  expect(result.exitCode).toBe(0);
  expect(await readText(betaAgent)).toBe("user edit\n");
  const json = JSON.parse(result.stdout) as {
    diagnostics: Array<{ code: string; path?: string; severity: string }>;
    plan: { changes: Array<{ path: string }> };
  };
  expect(json.diagnostics.filter((item) => item.code === "acf.apply.drift")).toEqual([
    expect.objectContaining({ severity: "warn", path: betaAgent }),
  ]);
  expect(json.plan.changes.map((change) => change.path)).not.toContain(betaAgent);
  expect(await sidecarPaths(claudeRoot)).toContain("agents/beta-helper.md");
  expect(await readText(path.join(scope.cwd, ".mcp.json"))).not.toContain("beta-server");

  // Once the user deletes the edited file, the next apply forgets it without a warning.
  await rm(betaAgent);
  const settled = await runCaplet(scope, [
    "apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
    "--json",
  ]);
  const after = JSON.parse(settled.stdout) as { diagnostics: Array<{ code: string }> };
  expect(after.diagnostics.map((item) => item.code)).not.toContain("acf.apply.drift");
  expect(await sidecarPaths(claudeRoot)).not.toContain("agents/beta-helper.md");
});

test("renaming a skill removes the old directories and sidecar entries", async () => {
  await writeSkill("old-skill", { "reference.md": "ref\n" });
  expect((await applyProject(scope)).exitCode).toBe(0);
  const native = path.join(scope.cwd, ".claude", "skills");
  expect(existsSync(path.join(native, "old-skill", "reference.md"))).toBe(true);

  const skills = path.join(scope.sourceRoot, "alpha", "skills");
  await rename(path.join(skills, "old-skill"), path.join(skills, "new-skill"));
  await writeSkill("new-skill", { "reference.md": "ref\n" });
  expect(await reapply()).toBe(0);

  for (const root of [native, path.join(scope.agentsDir, "skills")]) {
    expect(await readdir(root)).not.toContain("old-skill");
    expect(existsSync(path.join(root, "new-skill", "SKILL.md"))).toBe(true);
  }
  for (const root of [path.join(scope.cwd, ".claude"), scope.agentsDir]) {
    expect((await sidecarPaths(root)).filter((entry) => entry.includes("old-skill"))).toEqual([]);
  }
});

test("a file removed from a kept skill is swept although capability and facet still exist", async () => {
  await writeSkill("kept", { "reference.md": "ref\n" });
  expect((await applyProject(scope)).exitCode).toBe(0);
  await writeSkill("kept");
  await rm(path.join(scope.sourceRoot, "alpha", "skills", "kept", "reference.md"));
  expect(await reapply()).toBe(0);

  for (const root of [
    path.join(scope.cwd, ".claude", "skills"),
    path.join(scope.agentsDir, "skills"),
  ]) {
    expect(existsSync(path.join(root, "kept", "reference.md"))).toBe(false);
    expect(existsSync(path.join(root, "kept", "SKILL.md"))).toBe(true);
  }
  expect(
    (await sidecarPaths(path.join(scope.cwd, ".claude"))).filter((entry) =>
      entry.endsWith("reference.md"),
    ),
  ).toEqual([]);
});

test("renaming an MCP server removes the old server key", async () => {
  expect((await applyProject(scope)).exitCode).toBe(0);
  await writeText(
    path.join(scope.sourceRoot, "alpha", "mcp", "mcp.yml"),
    "servers:\n  - name: alpha-renamed\n    transport: stdio\n    command: node\n    args: [server.js]\n",
  );
  expect(await reapply()).toBe(0);
  const mcp = JSON.parse(await readText(path.join(scope.cwd, ".mcp.json"))) as {
    mcpServers: Record<string, unknown>;
  };
  expect(Object.keys(mcp.mcpServers).sort()).toEqual(["alpha-renamed", "beta-server"]);
});

test("a symlinked .claude/skills leaving the output root fails Claude without writing through it", async () => {
  await writeSkill("linked");
  const outside = path.join(scope.dir, "outside");
  await mkdir(outside, { recursive: true });
  await mkdir(path.join(scope.cwd, ".claude"), { recursive: true });
  await symlink(outside, path.join(scope.cwd, ".claude", "skills"));

  const result = await applyProject(scope);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain(path.join(".claude", "skills", "linked"));
  expect(await readdir(outside)).toEqual([]);
  expect(existsSync(path.join(scope.cwd, ".claude", "agents", "alpha-helper.md"))).toBe(false);
});

test("remove does not delete through a skills directory replaced by an outside symlink", async () => {
  await writeSkill("linked");
  expect((await applyProject(scope)).exitCode).toBe(0);
  const skills = path.join(scope.cwd, ".claude", "skills");
  const outside = path.join(scope.dir, "outside");
  await rename(skills, outside);
  await symlink(outside, skills);

  const result = await runCaplet(scope, [
    "remove",
    "alpha-cap",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
  ]);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain(path.join("skills", "linked"));
  expect(existsSync(path.join(outside, "linked", "SKILL.md"))).toBe(true);
});

test("an owned file replaced by a symlink leaving the root fails Claude without writing through it", async () => {
  await writeSkill("linked");
  expect((await applyProject(scope)).exitCode).toBe(0);
  const skill = path.join(scope.cwd, ".claude", "skills", "linked", "SKILL.md");
  const outside = path.join(scope.dir, "outside.md");
  await writeText(outside, "outside\n");
  await rm(skill);
  await symlink(outside, skill);
  await writeText(
    path.join(scope.sourceRoot, "alpha", "skills", "linked", "SKILL.md"),
    "---\nname: linked\ndescription: Skill linked\n---\nChanged.\n",
  );

  const result = await runCaplet(scope, [
    "apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "claude",
    "--mode",
    "force",
    "--json",
  ]);

  expect(result.exitCode).not.toBe(0);
  expect(await readText(outside)).toBe("outside\n");
  const json = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; path?: string }> };
  expect(json.diagnostics).toContainEqual(
    expect.objectContaining({ code: "acf.apply.outside-root", path: skill }),
  );
});

test("a sidecar replaced by a symlink leaving the root fails that root without writing through it", async () => {
  expect((await applyProject(scope)).exitCode).toBe(0);
  const sidecar = path.join(scope.cwd, ".claude", ".acf-managed.json");
  const outside = path.join(scope.dir, "outside.json");
  await rename(sidecar, outside);
  const before = await readText(outside);
  await symlink(outside, sidecar);
  await writeText(
    path.join(scope.sourceRoot, "alpha", "agents", "alpha-helper.md"),
    "---\nname: alpha-helper\ndescription: Helper alpha-cap\n---\nNew help.\n",
  );

  expect(await reapply()).not.toBe(0);
  expect(await readText(outside)).toBe(before);
});
