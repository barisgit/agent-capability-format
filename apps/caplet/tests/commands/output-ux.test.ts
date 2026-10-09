import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, runCaplet, writeText } from "../helpers";

test("fetch presents a clear command header and result summary", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("caplet fetch is deprecated");
    expect(result.stdout).toContain("ok Updated 2 capabilities");
    expect(result.stdout).toContain("Resolved  2 capabilities");
  } finally {
    await cleanup(scope);
  }
});

test("diff groups file changes and ends with a pending summary", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Plan: 5 changes");
    expect(result.stdout).toMatch(/\+ CLAUDE\.md/);
    expect(result.stdout).toContain("alpha-cap, beta-cap");
    expect(result.stdout.match(/CLAUDE\.md/g)).toHaveLength(1);
    expect(result.stdout).toContain("warn 5 files");
  } finally {
    await cleanup(scope);
  }
});

test("ls presents capabilities as a scoped, readable inventory", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, ["ls", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("project  ");
    expect(result.stdout).toContain("alpha-cap  1.0.0");
    expect(result.stdout).toContain("agents 1, instructions 1, mcp 1");
    expect(result.stdout).toContain("ok 2 capabilities");
  } finally {
    await cleanup(scope);
  }
});

test("ls gives an actionable empty state", async () => {
  const scope = await makeScope();
  try {
    await writeText(`${scope.agentsDir}/capabilities.yml`, "acf: 1\ncapabilities: []\n");
    const result = await runCaplet(scope, ["ls", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No capabilities installed.");
    expect(result.stdout).toContain("caplet add <source> --scope project");
  } finally {
    await cleanup(scope);
  }
});

test("check reports what was validated", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, ["check", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Outputs are stale");
  } finally {
    await cleanup(scope);
  }
});

test("diagnostics separate the code, message, and recovery context", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, [
      "inspect",
      "missing-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("fail Capability not found: missing-cap");
    expect(result.stderr).toContain("code  acf.caplet.not-found");
    expect(result.stderr).toContain("1 problem (1 error)");
  } finally {
    await cleanup(scope);
  }
});

test("emit dry-run uses the same change language without writing", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, [
      "emit",
      "--dry-run",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Plan: 5 changes");
    expect(result.stdout).toContain("warn 5 files");
    expect(await Bun.file(`${scope.cwd}/.claude/CLAUDE.md`).exists()).toBe(false);
  } finally {
    await cleanup(scope);
  }
});

test("apply connects the change plan to an applied summary", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Plan: 5 changes");
    expect(result.stdout).toContain("ok Applied 5 files (5 writes, 0 deletes)");
    expect(await Bun.file(`${scope.cwd}/.claude/CLAUDE.md`).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("add confirms the source and manifest it changed", async () => {
  const scope = await makeScope();
  try {
    const source = `path:${scope.sourceRoot}/gamma`;
    await writeText(
      `${scope.sourceRoot}/gamma/acf.yml`,
      "acf: 1\nname: gamma-cap\nversion: 1.0.0\ndescription: gamma\n",
    );
    await writeText(
      `${scope.sourceRoot}/gamma/instructions/always.md`,
      "---\nname: always\ndescription: G\nactivation: always\n---\nGamma.\n",
    );
    const result = await runCaplet(scope, [
      "add",
      source,
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Added path source (project scope)");
    expect(result.stdout).toContain("Manifest  ");
    expect(result.stdout).toContain("ok Applied");
    expect(result.stdout).toContain("/.agents/capabilities.yml");
    expect(result.stdout).toContain(`Source        ${source}`);
  } finally {
    await cleanup(scope);
  }
});

test("update makes the refreshed capability explicit", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, [
      "update",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Updated alpha-cap");
  } finally {
    await cleanup(scope);
  }
});

test("remove reports both manifest removal and managed cleanup", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    const result = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Removed alpha-cap (project scope)");
    expect(result.stdout).toMatch(/Managed {2}\d+ managed regions cleaned/);
  } finally {
    await cleanup(scope);
  }
});

test("doctor organizes checks by concern and summarizes health", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["doctor", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Environment\n  ok Git available");
    expect(result.stdout).toContain("\nTargets\n");
    expect(result.stdout).toContain("\nLockfiles\n  ok Project lockfile");
    expect(result.stdout).toMatch(/ok \d+ checks passed/);
  } finally {
    await cleanup(scope);
  }
});

test("diff has a calm empty state when output is current", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    const result = await runCaplet(scope, [
      "diff",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok Everything up to date");
    expect(result.stdout).not.toContain("warn 0 changes");
  } finally {
    await cleanup(scope);
  }
});

test("quiet suppresses the complete success presentation", async () => {
  const scope = await makeScope();
  try {
    // Install first: a quiet run still lists executable components it adds.
    const scopeArgs = ["--cwd", scope.cwd, "--scope", "project"];
    expect((await runCaplet(scope, ["apply", ...scopeArgs])).exitCode).toBe(0);
    const result = await runCaplet(scope, [
      "update",
      "--no-apply",
      "--quiet",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  } finally {
    await cleanup(scope);
  }
});

test("usage errors are concise, sentence-cased, and visible in quiet mode", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "add",
      "path:/tmp/example",
      "--quiet",
      "--scope",
      "all",
      "--cwd",
      scope.cwd,
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Invalid --scope for this command: all");
  } finally {
    await cleanup(scope);
  }
});

test("diff collapses many same-capability files and --verbose expands them", async () => {
  const scope = await makeScope();
  try {
    for (let index = 0; index < 8; index += 1) {
      await writeText(
        path.join(scope.sourceRoot, "alpha", "skills", `bulk-${index}`, "SKILL.md"),
        `---\nname: bulk-${index}\ndescription: Bulk skill ${index}\n---\nBulk ${index}.\n`,
      );
    }
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
    const args = ["diff", "--cwd", scope.cwd, "--scope", "project", "--target", "claude"];

    const collapsed = await runCaplet(scope, args);
    expect(collapsed.exitCode).toBe(0);
    expect(collapsed.stdout).toMatch(/\+ skills\/ +8 files/);
    expect(collapsed.stdout).not.toContain("bulk-3/SKILL.md");

    const expanded = await runCaplet(scope, [...args, "--verbose"]);
    expect(expanded.exitCode).toBe(0);
    expect(expanded.stdout).toContain("bulk-3/SKILL.md");
  } finally {
    await cleanup(scope);
  }
});

test("apply and status surface reach: sources and managed targets", async () => {
  const scope = await makeScope();
  try {
    const applied = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toContain("sources");
    expect(applied.stdout).toContain("1 capability");
    expect(applied.stdout).toContain("targets");
    expect(applied.stdout).toContain("claude .claude");
    expect(applied.stdout).not.toContain("codex");

    const status = await runCaplet(scope, ["status", "--cwd", scope.cwd, "--scope", "project"]);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("capabilities");
    expect(status.stdout).toContain("from");
    expect(status.stdout).toContain("writes to");
    expect(status.stdout).toContain("claude .claude");
    expect(status.stdout).not.toContain("codex");

    const json = await runCaplet(scope, [
      "status",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    const parsed = JSON.parse(json.stdout);
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(Array.isArray(parsed.targets)).toBe(true);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].capabilities).toBe(1);
    expect(parsed.targets.every((t: { files: number }) => t.files > 0)).toBe(true);

    const applyJson = await runCaplet(scope, [
      "apply",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    const applyParsed = JSON.parse(applyJson.stdout);
    expect(Array.isArray(applyParsed.sources)).toBe(true);
    expect(Array.isArray(applyParsed.targets)).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("status -v shows the managed footprint compactly", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      `${scope.sourceRoot}/alpha/skills/research/SKILL.md`,
      "---\nname: research\ndescription: Research skill\n---\nUse research.\n",
    );
    const applied = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(applied.exitCode).toBe(0);

    const result = await runCaplet(scope, [
      "status",
      "-v",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude .claude");
    expect(result.stdout).toContain("skills/research/");
    expect(result.stdout).not.toContain("skills/research/SKILL.md");
    expect(result.stdout).toContain("agents/alpha-helper.md");
    expect(result.stdout).toContain("alpha-cap");

    const json = await runCaplet(scope, [
      "status",
      "-v",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    const parsed = JSON.parse(json.stdout);
    expect(Array.isArray(parsed.footprint)).toBe(true);
    const research = parsed.footprint.find((f: { path: string }) => f.path === "skills/research/");
    expect(research.kind).toBe("dir");
    expect(research.capability).toBe("alpha-cap");
  } finally {
    await cleanup(scope);
  }
});
