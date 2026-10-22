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

test("diff alias matches apply --dry-run output and warns on stderr", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project"]);
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "claude"];
    const alias = await runCaplet(scope, ["diff", ...args]);
    const canonical = await runCaplet(scope, ["apply", "--dry-run", ...args]);

    expect(alias.exitCode).toBe(0);
    expect(alias.stdout).toBe(canonical.stdout);
    expect(alias.stderr).toContain("caplet diff is deprecated");
    expect(canonical.stderr).not.toContain("deprecated");
  } finally {
    await cleanup(scope);
  }
});

test("emit and inspect aliases warn and delegate", async () => {
  const scope = await makeScope();
  try {
    await runCaplet(scope, ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project"]);
    const emit = await runCaplet(scope, [
      "emit",
      "--dry-run",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(emit.exitCode).toBe(0);
    expect(emit.stderr).toContain("caplet emit is deprecated");
    expect(emit.stdout).toContain("Plan:");

    const inspect = await runCaplet(scope, [
      "inspect",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(inspect.exitCode).toBe(0);
    expect(inspect.stderr).toContain("caplet inspect is deprecated");
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

test("add infers project scope inside a project and echoes it", async () => {
  const scope = await makeScope();
  try {
    const nested = path.join(scope.cwd, "src", "deep");
    await writeText(path.join(nested, ".keep"), "");
    const result = await runCaplet(scope, [
      "add",
      `path:${await writeGamma(scope)}`,
      "--as",
      "alpha-copy",
      "--no-apply",
      "--cwd",
      nested,
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
    await runCaplet(scope, ["fetch", "--cwd", scope.cwd, "--scope", "project"]);
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
