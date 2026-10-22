import { expect, test } from "bun:test";
import { cp, mkdir, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

for (const command of ["add", "remove", "apply", "update"]) {
  test(`${command} --scope project refuses an ancestor manifest`, async () => {
    const scope = await makeScope();
    try {
      const cwd = path.join(scope.cwd, "sub", "deeper");
      await mkdir(cwd, { recursive: true });
      if (command === "add") {
        await writeText(
          path.join(scope.agentsDir, "capabilities.yml"),
          "acf: 1\ncapabilities: []\n",
        );
      }
      if (command === "remove") {
        expect(
          (await runCaplet(scope, ["update", "--cwd", scope.cwd, "--no-apply"])).exitCode,
        ).toBe(0);
      }
      const before = await readdir(scope.agentsDir);
      const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
      const args =
        command === "add"
          ? [path.join(scope.sourceRoot, "alpha")]
          : command === "remove"
            ? ["alpha-cap"]
            : [];
      const result = await runCaplet(scope, [
        command,
        ...args,
        "--cwd",
        cwd,
        "--scope",
        "project",
        "--target",
        "codex",
        "-y",
        "--json",
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("caplet init");
      expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).toBe(manifest);
      expect(await readdir(scope.agentsDir)).toEqual(before);
      expect(await readdir(cwd)).toEqual([]);
    } finally {
      await cleanup(scope);
    }
  });
}

test("project inference ignores another tree's ancestor and uses user scope", async () => {
  const scope = await makeScope();
  try {
    const cwd = path.join(scope.cwd, "sub");
    await mkdir(cwd, { recursive: true });
    await writeText(path.join(scope.agentsDir, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
    const manifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
    const result = await runCaplet(scope, [
      "add",
      path.join(scope.sourceRoot, "alpha"),
      "--cwd",
      cwd,
      "--no-apply",
      "--json",
      "-y",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).added.scope).toBe("user");
    expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).toBe(manifest);
    expect(await readdir(cwd)).toEqual([]);
  } finally {
    await cleanup(scope);
  }
});

for (const location of ["home", "alias"]) {
  test(`project scope cannot alias user scope (${location})`, async () => {
    const scope = await makeScope();
    try {
      const userAgents = path.join(scope.home, ".agents");
      await writeText(path.join(userAgents, "capabilities.yml"), "acf: 1\ncapabilities: []\n");
      const cwd = location === "home" ? scope.home : path.join(scope.dir, "alias");
      if (location === "alias") {
        await mkdir(cwd);
        await symlink(userAgents, path.join(cwd, ".agents"));
      }
      const result = await runCaplet(scope, [
        "add",
        path.join(scope.sourceRoot, "alpha"),
        "--cwd",
        cwd,
        "--scope",
        "project",
        "--no-apply",
        "--json",
        "-y",
      ]);
      expect(result.exitCode).toBe(2);
      expect(await readdir(userAgents)).toEqual(["capabilities.yml"]);
      const list = await runCaplet(scope, ["list", "--cwd", cwd, "--json"]);
      expect(JSON.parse(list.stdout).scopes.map((item: { scope: string }) => item.scope)).toEqual([
        "user",
      ]);
    } finally {
      await cleanup(scope);
    }
  });
}

test("runtime loads local capabilities without a capabilities.yml manifest", async () => {
  const scope = await makeScope();
  try {
    const cwd = path.join(scope.dir, "manual");
    await cp(
      path.join(scope.sourceRoot, "alpha"),
      path.join(cwd, ".agents", "capabilities", "alpha-cap"),
      { recursive: true },
    );
    const result = await runCaplet(scope, ["list", "--cwd", cwd, "--scope", "project", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).scopes[0].capabilities[0].name).toBe("alpha-cap");
  } finally {
    await cleanup(scope);
  }
});

test("all outside a project emits only user artifacts with an info diagnostic", async () => {
  const scope = await makeScope();
  try {
    const cwd = path.join(scope.cwd, "nested");
    await mkdir(cwd);
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      cwd,
      "--target",
      "codex",
      "--json",
      "-y",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "info",
        code: "acf.scope.project-not-found",
      }),
    );
    expect(await readdir(cwd)).toEqual([]);
    expect(await readdir(scope.agentsDir)).toEqual(["capabilities.yml"]);
  } finally {
    await cleanup(scope);
  }
});

test("init cannot create project scope at the user home", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, ["init", "--cwd", scope.home]);
    expect(result.exitCode).toBe(2);
    expect(await readdir(path.join(scope.home, ".agents"))).toEqual([]);
  } finally {
    await cleanup(scope);
  }
});

test("an initialized nested project keeps manifest, snapshots and output together", async () => {
  const scope = await makeScope();
  try {
    const cwd = path.join(scope.cwd, "sub", "deeper");
    await mkdir(cwd, { recursive: true });
    const parentManifest = await readText(path.join(scope.agentsDir, "capabilities.yml"));
    expect((await runCaplet(scope, ["init", "--cwd", cwd])).exitCode).toBe(0);
    const result = await runCaplet(scope, [
      "add",
      path.join(scope.sourceRoot, "alpha"),
      "--cwd",
      cwd,
      "--scope",
      "project",
      "--target",
      "codex",
      "--json",
      "-y",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).added.manifest).toBe(
      path.join(cwd, ".agents", "capabilities.yml"),
    );
    for (const file of [
      ".agents/capabilities.yml",
      ".agents/capabilities.lock",
      ".agents/capabilities/alpha-cap/acf.yml",
      ".codex/config.toml",
    ]) {
      expect(await Bun.file(path.join(cwd, file)).exists()).toBe(true);
    }
    expect(await readText(path.join(scope.agentsDir, "capabilities.yml"))).toBe(parentManifest);
    expect(await readdir(scope.agentsDir)).toEqual(["capabilities.yml"]);
  } finally {
    await cleanup(scope);
  }
});
