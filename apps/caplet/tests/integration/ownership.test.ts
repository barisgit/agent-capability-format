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

test("a capability that gains a server at a path keeps one sidecar entry there", async () => {
  const scope = await makeScope();
  try {
    const server = (name: string) =>
      `  - name: ${name}\n    transport: stdio\n    command: node\n    args: [server.js]\n`;
    const mcpYml = path.join(scope.sourceRoot, "alpha", "mcp", "mcp.yml");
    await writeText(mcpYml, `servers:\n${server("alpha-server")}`);
    expect((await applyProject(scope)).exitCode).toBe(0);
    await writeText(mcpYml, `servers:\n${server("alpha-server")}${server("second")}`);
    const update = ["update", "--no-apply", "--cwd", scope.cwd, "--scope", "project"];
    expect((await runCaplet(scope, update)).exitCode).toBe(0);

    expect((await applyProject(scope)).exitCode).toBe(0);

    const sidecar = JSON.parse(
      await readText(path.join(scope.cwd, ".claude", ".acf-managed.json")),
    ) as { managed: Array<{ capability: string; owns: Array<{ pointer?: string }> }> };
    const serverEntries = sidecar.managed
      .filter((entry) => entry.capability === "alpha-cap")
      .map((entry) => entry.owns.flatMap((own) => own.pointer ?? []))
      .filter((pointers) => pointers.some((pointer) => pointer.startsWith("/mcpServers/")));
    expect(serverEntries).toEqual([["/mcpServers/alpha-server", "/mcpServers/second"]]);
  } finally {
    await cleanup(scope);
  }
});
