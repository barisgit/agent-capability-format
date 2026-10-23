import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { applyProject, cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

test("a path source can select acf/ itself and preserve nested collection selectors", async () => {
  const scope = await makeScope();
  try {
    const collection = path.join(scope.sourceRoot, "collection", "acf");
    await writeText(
      path.join(collection, "nested", "one", "acf.yml"),
      "acf: 1\nname: selected-cap\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(collection, "two", "acf.yml"),
      "acf: 1\nname: other-cap\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${collection}/\n    capabilities: nested/*\n`,
    );
    await fetchProject(scope);
    const listed = await runCaplet(scope, [
      "list",
      "--json",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);
    expect(listed.exitCode).toBe(0);
    expect(
      JSON.parse(listed.stdout).scopes[0].capabilities.map((cap: { name: string }) => cap.name),
    ).toEqual(["selected-cap"]);
  } finally {
    await cleanup(scope);
  }
});

test("caplet check validates resolved capabilities", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const stale = await runCaplet(scope, ["check", "--cwd", scope.cwd, "--scope", "project"]);
    expect(stale.exitCode).toBe(1);
    expect(stale.stderr).toContain("Outputs are stale");
    await runCaplet(scope, ["apply", "--cwd", scope.cwd, "--scope", "project"]);
    const result = await runCaplet(scope, ["check", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain("ok Validation passed");
  } finally {
    await cleanup(scope);
  }
});

test("caplet check fails on a component apply refuses, with the plan diagnostic", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "beta", "mcp", "mcp.yml"),
      "servers:\n  - name: events\n    transport: sse\n    url: https://mcp.example.com/events\n",
    );
    const target = ["--cwd", scope.cwd, "--scope", "project", "--target", "codex"];
    await runCaplet(scope, ["apply", ...target]);

    const human = await runCaplet(scope, ["check", ...target]);
    expect(human.exitCode).toBe(2);
    expect(human.stdout + human.stderr).toContain("Validation failed");
    const json = await runCaplet(scope, ["check", ...target, "--json"]);
    expect(json.exitCode).toBe(2);
    const parsed = JSON.parse(json.stdout) as {
      ok: boolean;
      result: string;
      diagnostics: Array<{ code: string }>;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.result).toBe("invalid");
    expect(parsed.diagnostics.map((item) => item.code)).toContain("acf.support.refused");
  } finally {
    await cleanup(scope);
  }
});

test("check never reports a missing lock entry as clean, with frozen taking exit 3", async () => {
  const scope = await makeScope();
  try {
    const args = ["--cwd", scope.cwd, "--scope", "project", "--target", "codex"];
    for (const frozen of [false, true]) {
      const result = await runCaplet(scope, [
        "check",
        ...args,
        "--json",
        ...(frozen ? ["--frozen"] : []),
      ]);
      expect(result.exitCode).toBe(frozen ? 3 : 2);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        result: frozen ? "lock-stale" : "invalid",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ severity: "error", code: "acf.lock.missing-entry" }),
        ]),
      });
    }
  } finally {
    await cleanup(scope);
  }
});

test("check reports edited stale output as manual cleanup, not clean", async () => {
  const scope = await makeScope();
  try {
    expect((await applyProject(scope)).exitCode).toBe(0);
    await writeText(path.join(scope.cwd, ".claude", "agents", "beta-helper.md"), "User edits\n");
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, "alpha")}\n`,
    );
    expect((await applyProject(scope)).exitCode).toBe(0);
    const args = ["check", "--cwd", scope.cwd, "--scope", "project", "--target", "claude"];
    const json = await runCaplet(scope, [...args, "--json"]);
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: true,
      result: "manual-cleanup",
      pending: 0,
    });
    expect(json.stdout).toContain("acf.apply.drift");
    const human = await runCaplet(scope, args);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("manual cleanup remains");
    expect(human.stdout).not.toContain("Validation passed");
  } finally {
    await cleanup(scope);
  }
});

test("caplet check --frozen reads a relative path source from the manifest directory", async () => {
  const scope = await makeScope();
  try {
    const relative = path.relative(scope.agentsDir, path.join(scope.sourceRoot, "alpha"));
    await writeFile(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${relative}\n`,
      "utf8",
    );
    await fetchProject(scope);

    const result = await runCaplet(scope, [
      "check",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--frozen",
    ]);

    expect(result.stdout + result.stderr).not.toContain("acf.lock.");
    expect(result.exitCode).not.toBe(3);
  } finally {
    await cleanup(scope);
  }
});
