import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

async function writeGamma(scope: { sourceRoot: string }): Promise<string> {
  const root = path.join(scope.sourceRoot, "gamma");
  await writeText(
    path.join(root, "acf.yml"),
    "acf: 1\nname: gamma-cap\nversion: 1.0.0\ndescription: gamma\n",
  );
  await writeText(
    path.join(root, "instructions", "gamma-always.md"),
    "---\nname: gamma-always\ndescription: G\nactivation: always\n---\nGamma.\n",
  );
  return root;
}

test("removed command names and flags are unknown usage errors", async () => {
  const scope = await makeScope();
  try {
    const cases = [
      ...["inspect", "diff", "emit", "fetch"].map((name) => ({
        args: [name],
        error: `unknown command: ${name}`,
      })),
      ...["--fail-on-lossy", "--mode", "--mode=force"].map((flag) => ({
        args: ["apply", flag],
        error: `unknown flag: ${flag.split("=")[0]}`,
      })),
      ...["--ref", "--rename"].map((flag) => ({
        args: ["add", "github:owner/repo", flag, "main"],
        error: `unknown flag: ${flag}`,
      })),
    ];
    for (const entry of cases) {
      const result = await runCaplet(scope, [...entry.args, "--cwd", scope.cwd]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(entry.error);
      expect(result.stderr).not.toContain("deprecated");
    }
  } finally {
    await cleanup(scope);
  }
});

test("removed syntax names its replacement in human and JSON usage errors", async () => {
  const scope = await makeScope();
  try {
    for (const [args, replacement] of [
      [["inspect"], "caplet show"],
      [["diff"], "caplet apply --dry-run"],
      [["emit"], "caplet apply"],
      [["fetch"], "caplet update --no-apply"],
      [["add", "github:owner/repo", "--ref=main"], "--pin"],
      [["add", "github:owner/repo", "--rename", "new"], "--as"],
      [["apply", "--fail-on-lossy"], "--strict"],
    ] as const) {
      for (const json of [false, true]) {
        const result = await runCaplet(scope, [...args, ...(json ? ["--json"] : [])]);
        expect(result.exitCode).toBe(2);
        const message = json ? JSON.parse(result.stdout).diagnostics[0].message : result.stderr;
        expect(message).toContain(`use ${replacement} instead`);
        expect(message).not.toContain("--yes");
      }
    }
  } finally {
    await cleanup(scope);
  }
});

test("ls alias is permanent and silent", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["ls", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("deprecated");
  } finally {
    await cleanup(scope);
  }
});

test("add infers project scope at the project root and echoes it", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "add",
      `path:${await writeGamma(scope)}`,
      "--as",
      "alpha-copy",
      "--no-apply",
      "--cwd",
      scope.cwd,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("(project scope)");
    const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
    expect(manifest).toContain("alpha-copy");
  } finally {
    await cleanup(scope);
  }
});

test("add infers user scope outside a project", async () => {
  const scope = await makeScope();
  try {
    const outside = path.join(scope.dir, "elsewhere");
    await writeText(path.join(outside, ".keep"), "");
    const result = await runCaplet(scope, [
      "add",
      `path:${await writeGamma(scope)}`,
      "--no-apply",
      "--cwd",
      outside,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("(user scope)");
    const manifest = await readText(path.join(scope.home, ".agents", "capabilities.yml"));
    expect(manifest).toContain("gamma");
  } finally {
    await cleanup(scope);
  }
});

test("add writes manifest and emitted files in one invocation", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "add",
      `path:${await writeGamma(scope)}`,
      "--as",
      "alpha-copy",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Plan:");
    expect(await Bun.file(path.join(scope.cwd, ".claude", "CLAUDE.md")).exists()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("bare caplet prints a status summary", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, ["--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("project");
    expect(result.stdout).toContain("alpha-cap, beta-cap");
  } finally {
    await cleanup(scope);
  }
});

test("init scaffolds a project manifest", async () => {
  const scope = await makeScope();
  try {
    const fresh = path.join(scope.dir, "fresh-project");
    await writeText(path.join(fresh, ".keep"), "");
    const result = await runCaplet(scope, ["init", "--cwd", fresh]);
    expect(result.exitCode).toBe(0);
    expect(await readText(path.join(fresh, ".agents", "capabilities.yml"))).toContain("acf: 1");
  } finally {
    await cleanup(scope);
  }
});
