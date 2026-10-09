import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

const serverYml = (name: string) =>
  `servers:\n  - name: ${name}\n    transport: stdio\n    command: node\n    args: [server.js]\n`;

test("two capabilities declaring one MCP server name write it for neither until one excludes it", async () => {
  const scope = await makeScope();
  try {
    await writeText(
      path.join(scope.sourceRoot, "beta", "mcp", "mcp.yml"),
      serverYml("alpha-server"),
    );
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "emit:\n  defaultTargets: [claude, codex]\n",
    );
    const args = ["apply", "--cwd", scope.cwd, "--scope", "project"];

    const clash = await runCaplet(scope, args);

    expect(clash.exitCode).toBe(2);
    const output = clash.stdout + clash.stderr;
    for (const target of ["claude", "codex"]) {
      for (const [capability, other] of [
        ["alpha-cap", "beta-cap"],
        ["beta-cap", "alpha-cap"],
      ]) {
        expect(output).toContain(
          `MCP server alpha-server of ${capability} is also declared by ${other} for ${target}, so caplet writes it for none of them; keep it in one capability with exclude: { mcp: [alpha-server] } on the others`,
        );
      }
    }
    expect(await Bun.file(path.join(scope.cwd, ".mcp.json")).exists()).toBe(false);
    expect(await Bun.file(path.join(scope.cwd, ".codex", "config.toml")).exists()).toBe(false);

    const alpha = path.join(scope.sourceRoot, "alpha");
    const beta = path.join(scope.sourceRoot, "beta");
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n  - source: path:${alpha}\n  - source: path:${beta}\n    exclude:\n      mcp: [alpha-server]\n`,
    );

    const resolved = await runCaplet(scope, args);

    expect(resolved.stderr).not.toContain("acf.mcp.config-conflict");
    expect(resolved.exitCode).toBe(0);
    const json = JSON.parse(await readText(path.join(scope.cwd, ".mcp.json"))) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(json.mcpServers)).toEqual(["alpha-server"]);
    const config = await readText(path.join(scope.cwd, ".codex", "config.toml"));
    expect(config.match(/# acf:begin mcp_servers\.alpha-server/g)?.length).toBe(1);
  } finally {
    await cleanup(scope);
  }
});

test("a JSON MCP config's user-defined server is never overwritten", async () => {
  const scope = await makeScope();
  try {
    const files = {
      claude: path.join(scope.cwd, ".mcp.json"),
      cursor: path.join(scope.cwd, ".cursor", "mcp.json"),
      opencode: path.join(scope.cwd, "opencode.json"),
      pi: path.join(scope.cwd, ".pi", "mcp.json"),
    };
    const user = { command: "my-alpha" };
    const userConfig = (target: string) =>
      `${JSON.stringify(target === "opencode" ? { mcp: { "alpha-server": user } } : { mcpServers: { "alpha-server": user } }, null, 2)}\n`;
    for (const [target, file] of Object.entries(files)) await writeText(file, userConfig(target));
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "emit:\n  defaultTargets: [claude, cursor, opencode, pi]\n",
    );
    const args = ["apply", "--cwd", scope.cwd, "--scope", "project"];

    const clash = await runCaplet(scope, args);

    expect(clash.exitCode).toBe(2);
    const output = clash.stdout + clash.stderr;
    for (const [target, file] of Object.entries(files)) {
      expect(output).toContain(
        `${file} already defines MCP server alpha-server (user-defined), so caplet does not write alpha-cap's server over it`,
      );
      expect(await readText(file)).toBe(userConfig(target));
    }

    for (const file of Object.values(files)) await rm(file);
    expect((await runCaplet(scope, args)).exitCode).toBe(0);

    const again = await runCaplet(scope, args);

    expect(again.stderr).not.toContain("acf.mcp.config-conflict");
    expect(again.exitCode).toBe(0);
  } finally {
    await cleanup(scope);
  }
});

/** A plugin-eligible capability (a skill and one MCP server) named `name`. */
async function serverSource(root: string, name: string, server: string): Promise<string> {
  const source = path.join(root, name);
  await writeText(path.join(source, "acf.yml"), `acf: 1\nname: ${name}\nversion: 1.0.0\n`);
  await writeText(
    path.join(source, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use ${name}\n---\nBody.\n`,
  );
  await writeText(path.join(source, "mcp", "mcp.yml"), serverYml(server));
  return source;
}

test("Claude plugins keep their servers in their own .mcp.json, so a shared name is no conflict", async () => {
  const scope = await makeScope();
  try {
    const sources = await Promise.all(
      ["first", "second"].map((name) => serverSource(scope.sourceRoot, name, "diff")),
    );
    await writeText(
      path.join(scope.agentsDir, "capabilities.yml"),
      `acf: 1\ncapabilities:\n${sources.map((source) => `  - source: path:${source}\n`).join("")}`,
    );
    await writeText(
      path.join(scope.agentsDir, "caplet.yml"),
      "emit:\n  defaultTargets: [claude]\n",
    );
    const userConfig = `${JSON.stringify({ mcpServers: { diff: { command: "my-diff" } } }, null, 2)}\n`;
    await writeText(path.join(scope.cwd, ".mcp.json"), userConfig);

    const result = await runCaplet(scope, ["apply", "--cwd", scope.cwd, "--scope", "project"]);

    expect(result.stderr).not.toContain("acf.mcp.config-conflict");
    expect(result.exitCode).toBe(0);
    expect(await readText(path.join(scope.cwd, ".mcp.json"))).toBe(userConfig);
    for (const name of ["first", "second"]) {
      const plugin = path.join(scope.cwd, ".claude", ".acf", "marketplace", "plugins", name);
      const json = JSON.parse(await readText(path.join(plugin, ".mcp.json"))) as {
        mcpServers: Record<string, unknown>;
      };
      expect(Object.keys(json.mcpServers)).toEqual(["diff"]);
    }
  } finally {
    await cleanup(scope);
  }
});
