import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, runCaplet, writeText } from "../helpers";

for (const declaration of [
  "servers.json",
  [{ worker: { command: "node", args: ["worker.js"] } }],
  "https://example.com/tools.mcpb",
]) {
  test(`plugin MCP declaration ${JSON.stringify(declaration)} stays installed until removed`, async () => {
    const scope = await makeScope();
    try {
      const source = path.join(scope.sourceRoot, "plugin");
      const manifest = path.join(source, ".claude-plugin", "plugin.json");
      await writeText(manifest, JSON.stringify({ name: "native-tools", mcpServers: declaration }));
      await writeText(
        path.join(source, "servers.json"),
        JSON.stringify({ worker: { command: "node", args: ["worker.js"] } }),
      );
      const flags = ["--cwd", scope.cwd, "--scope", "user", "--target", "claude", "--json"];
      const added = await runCaplet(scope, ["add", source, ...flags]);
      expect(added.exitCode).toBe(0);
      const again = await runCaplet(scope, ["apply", ...flags]);
      expect(again.exitCode).toBe(0);
      expect((JSON.parse(again.stdout) as { executables: unknown[] }).executables).toEqual([]);
      await writeText(manifest, JSON.stringify({ name: "native-tools" }));
      const updated = await runCaplet(scope, ["update", ...flags]);
      expect(updated.exitCode).toBe(0);
      expect((JSON.parse(updated.stdout) as { executables: unknown[] }).executables).toContainEqual(
        expect.objectContaining({ kind: "mcp-server", change: "removed" }),
      );
    } finally {
      await cleanup(scope);
    }
  });
}
