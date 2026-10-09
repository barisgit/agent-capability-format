import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, fetchProject, makeScope, runCaplet, writeText } from "../helpers";

test("caplet ls lists capabilities per scope", async () => {
  const scope = await makeScope();
  try {
    await fetchProject(scope);
    const result = await runCaplet(scope, ["ls", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("project  ");
    expect(result.stdout).toContain("NAME");
    expect(result.stdout).toContain("alpha-cap  1.0.0");
    expect(result.stdout).toMatch(/beta-cap +1\.0\.0/);
  } finally {
    await cleanup(scope);
  }
});

test("caplet ls counts a server or hook declared for several targets once", async () => {
  const scope = await makeScope();
  try {
    const alpha = path.join(scope.sourceRoot, "alpha");
    const server = "      - name: native\n        transport: stdio\n        command: node\n";
    await writeText(
      path.join(alpha, "mcp", "mcp.yml"),
      `servers:\n  - name: alpha-server\n    transport: stdio\n    command: node\ntargets:\n  claude:\n    servers:\n${server}  codex:\n    servers:\n${server}`,
    );
    const hook =
      "        - name: guard\n          run:\n            command: ./guard.sh\n          effect: observe\n";
    await writeText(
      path.join(alpha, "hooks", "hooks.yml"),
      `targets:\n  claude:\n    hooks:\n      PreToolUse:\n${hook}  codex:\n    hooks:\n      PreToolUse:\n${hook}`,
    );
    await fetchProject(scope);
    const result = await runCaplet(scope, ["ls", "--cwd", scope.cwd, "--scope", "project"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/alpha-cap +1\.0\.0 +.*hooks 1, mcp 2\n/);
  } finally {
    await cleanup(scope);
  }
});
