import { expect, test } from "bun:test";
import path from "node:path";
import { cleanup, makeScope, readText, runCaplet, writeText } from "../helpers";

const DOLLAR = "$";
const AP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

type LockFile = {
  entries: { capabilityNames: string[]; resolvedCapabilities?: { format: string }[] }[];
};

async function lockedFormats(agentsDir: string, name: string): Promise<string[] | undefined> {
  const lock = JSON.parse(await readText(path.join(agentsDir, "capabilities.lock"))) as LockFile;
  return lock.entries
    .find((entry) => entry.capabilityNames.includes(name))
    ?.resolvedCapabilities?.map((record) => record.format);
}

test("caplet add installs a Claude plugin into the loose targets", async () => {
  const scope = await makeScope();
  try {
    const plugin = path.join(scope.sourceRoot, "review-plugin");
    await writeText(
      path.join(plugin, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "review-kit", version: "1.2.0", description: "Review helpers" }),
    );
    await writeText(
      path.join(plugin, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\nReview.\n",
    );
    await writeText(path.join(plugin, "skills", "review", "checklist.md"), "- one\n");
    await writeText(
      path.join(plugin, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          files: { command: `${DOLLAR}{CLAUDE_PLUGIN_ROOT}/bin/files`, args: ["--stdio"] },
        },
      }),
    );
    await writeText(path.join(plugin, "agents", "reviewer.md"), "---\nname: reviewer\n---\n");

    const result = await runCaplet(scope, [
      "add",
      `path:${plugin}`,
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Capabilities  review-kit");
    expect(await lockedFormats(scope.agentsDir, "review-kit")).toEqual(["claude-plugin"]);
    const snapshot = path.join(scope.agentsDir, "capabilities", "review-kit");
    expect(await Bun.file(path.join(snapshot, ".claude-plugin", "plugin.json")).exists()).toBe(
      true,
    );
    for (const file of ["SKILL.md", "checklist.md"]) {
      expect(await Bun.file(path.join(scope.agentsDir, "skills", "review", file)).exists()).toBe(
        true,
      );
    }
    const claudeMcp = JSON.parse(await readText(path.join(scope.cwd, ".mcp.json")));
    expect(claudeMcp.mcpServers.files).toEqual({
      transport: "stdio",
      command: path.join(snapshot, "bin", "files"),
      args: ["--stdio"],
    });
  } finally {
    await cleanup(scope);
  }
});

test("caplet add renames a foreign package whose name is not a slug", async () => {
  const scope = await makeScope();
  try {
    const plugin = path.join(scope.sourceRoot, "acme-docs");
    await writeText(
      path.join(plugin, "plugin.json"),
      JSON.stringify({ $schema: AP_SCHEMA, name: "acme.docs", version: "1.0.0" }),
    );
    await writeText(
      path.join(plugin, "skills", "write", "SKILL.md"),
      "---\nname: write\ndescription: Write docs\n---\nWrite.\n",
    );
    const args = ["add", `path:${plugin}`, "--cwd", scope.cwd, "--scope", "project"];

    const refused = await runCaplet(scope, args);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr + refused.stdout).toContain("rename: acme-docs");

    const renamed = await runCaplet(scope, [...args, "--as", "acme-docs"]);
    expect(renamed.exitCode).toBe(0);
    expect(await lockedFormats(scope.agentsDir, "acme-docs")).toEqual(["agent-plugins"]);
    expect(await Bun.file(path.join(scope.agentsDir, "skills", "write", "SKILL.md")).exists()).toBe(
      true,
    );
  } finally {
    await cleanup(scope);
  }
});
