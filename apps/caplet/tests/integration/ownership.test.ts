import { expect, test } from "bun:test";
import path from "node:path";
import { applyProject, cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

test("apply preserves user JSON keys and remove cleans only ACF-owned regions", async () => {
  const scope = await makeScope();
  try {
    const mcpPath = path.join(scope.cwd, ".mcp.json");
    await writeText(mcpPath, '{"userKey":true,"mcpServers":{"manual":{"command":"keep"}}}\n');
    const apply = await applyProject(scope);
    expect(apply.exitCode).toBe(0);
    const applied = JSON.parse(await readText(mcpPath)) as {
      userKey?: boolean;
      mcpServers?: Record<string, unknown>;
    };
    expect(applied.userKey).toBe(true);
    expect(applied.mcpServers?.manual).toEqual({ command: "keep" });
    expect(applied.mcpServers?.["alpha-server"]).toBeDefined();

    const remove = await runCaplet(scope, [
      "remove",
      "alpha-cap",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "claude",
    ]);
    expect(remove.exitCode).toBe(0);
    const after = JSON.parse(await readText(mcpPath)) as {
      userKey?: boolean;
      mcpServers?: Record<string, unknown>;
    };
    expect(after.userKey).toBe(true);
    expect(after.mcpServers?.manual).toEqual({ command: "keep" });
    expect(after.mcpServers?.["alpha-server"]).toBeUndefined();
    expect(after.mcpServers?.["beta-server"]).toBeDefined();
  } finally {
    await cleanup(scope);
  }
});
