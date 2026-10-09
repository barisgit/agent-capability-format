import { expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, type TestScope, writeText } from "../helpers";

async function applyCodex(scope: TestScope) {
  return await runCaplet(scope, [
    "apply",
    "--cwd",
    scope.cwd,
    "--scope",
    "project",
    "--target",
    "codex",
  ]);
}

type CodexConfig = { model?: string; mcp_servers?: Record<string, Record<string, unknown>> };

test("Codex MCP servers round-trip through config.toml marker blocks", async () => {
  const scope = await makeScope();
  try {
    const configPath = path.join(scope.cwd, ".codex", "config.toml");
    await writeText(configPath, 'model = "o4"\n');
    const first = await applyCodex(scope);
    expect(first.exitCode).toBe(0);
    const applied = Bun.TOML.parse(await readText(configPath)) as CodexConfig;
    expect(applied.model).toBe("o4");
    expect(Object.keys(applied.mcp_servers ?? {}).sort()).toEqual(["alpha-server", "beta-server"]);
    expect(applied.mcp_servers?.["alpha-server"]).toEqual({ command: "node", args: ["server.js"] });

    const again = await applyCodex(scope);
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain("Everything up to date");

    await writeFile(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${path.join(scope.sourceRoot, "alpha")}\n`,
      "utf8",
    );
    const narrowed = await applyCodex(scope);
    expect(narrowed.exitCode).toBe(0);
    const text = await readText(configPath);
    expect(text).not.toContain("beta-server");
    const after = Bun.TOML.parse(text) as CodexConfig;
    expect(after.model).toBe("o4");
    expect(Object.keys(after.mcp_servers ?? {})).toEqual(["alpha-server"]);
  } finally {
    await cleanup(scope);
  }
});

test("apply creates the capability data directory a loose server references", async () => {
  const scope = await makeScope();
  try {
    const dataDir = ["$", "{ACF_DATA_DIR}"].join("");
    await writeText(
      path.join(scope.sourceRoot, "alpha", "mcp", "mcp.yml"),
      `servers:\n  - name: alpha-server\n    transport: stdio\n    command: node\n    env:\n      DATA: "${dataDir}"\n`,
    );
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "pi",
    ]);
    expect(result.exitCode).toBe(0);
    const expectedDir = path.join(scope.cwd, ".pi", ".acf", "data", "alpha-cap");
    const config = JSON.parse(await readText(path.join(scope.cwd, ".pi", "mcp.json"))) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    expect(config.mcpServers["alpha-server"]?.env).toEqual({ DATA: expectedDir });
    expect((await stat(expectedDir)).isDirectory()).toBe(true);
  } finally {
    await cleanup(scope);
  }
});

test("OpenCode project servers are written to opencode.json at the project root", async () => {
  const scope = await makeScope();
  try {
    const result = await runCaplet(scope, [
      "apply",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      "opencode",
    ]);
    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readText(path.join(scope.cwd, "opencode.json"))) as {
      mcp: Record<string, unknown>;
    };
    expect(config.mcp["alpha-server"]).toEqual({ type: "local", command: ["node", "server.js"] });
  } finally {
    await cleanup(scope);
  }
});

test("apply writes nothing while a capability fails validation", async () => {
  const scope = await makeScope();
  try {
    const hostReference = ["$", "{API_KEY}"].join("");
    await writeText(
      path.join(scope.sourceRoot, "alpha", "mcp", "mcp.yml"),
      `servers:\n  - name: alpha-server\n    transport: stdio\n    command: node\n    env:\n      API_KEY: "${hostReference}"\n`,
    );
    const result = await applyCodex(scope);
    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.stderr).toContain("acf.mcp.placeholder.pending");
    expect(await stat(path.join(scope.cwd, ".codex", "config.toml")).catch(() => null)).toBeNull();
  } finally {
    await cleanup(scope);
  }
});
