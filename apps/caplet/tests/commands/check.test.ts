import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

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
