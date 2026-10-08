import { afterEach, describe, expect, test } from "bun:test";
import {
  type ForeignReadResult,
  nativeExtras,
  packageValues,
  readAgentPluginsPackage,
} from "../src";
import { cleanup, makeCapability, tempDir } from "./helpers";

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const DOLLAR = "$";
const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await cleanup(dir);
});

function skill(name: string, description = `${name} skill`): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

async function read(
  files: Record<string, string>,
  options: { rename?: string; revision?: string | null } = {},
): Promise<ForeignReadResult & { root: string }> {
  const root = await tempDir();
  dirs.push(root);
  await makeCapability(root, files);
  const result = await readAgentPluginsPackage(root, {
    scope: "project",
    origin: { kind: "local", directory: root },
    revision: options.revision ?? null,
    ...(options.rename === undefined ? {} : { rename: options.rename }),
  });
  return { ...result, root };
}

function manifest(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ $schema: PLUGIN_SCHEMA, name: "docs-kit", version: "1.2.0", ...fields });
}

function mcp(servers: Record<string, unknown>): string {
  return JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: servers });
}

describe("Agent Plugins 1.0 reader", () => {
  test("a three-skill package is one capability with three skills", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest({
        description: "Docs helpers",
        author: { name: "Ada", email: "ada@example.com" },
        license: "MIT",
        keywords: ["docs"],
      }),
      "skills/write/SKILL.md": skill("write"),
      "skills/review/SKILL.md": skill("review"),
      "skills/publish/SKILL.md": skill("publish"),
      "skills/publish/template.md": "template\n",
    });
    expect(diagnostics).toEqual([]);
    expect(capability?.manifest).toEqual({
      acf: 1,
      name: "docs-kit",
      version: "1.2.0",
      description: "Docs helpers",
      authors: [{ name: "Ada", email: "ada@example.com" }],
      license: "MIT",
      keywords: ["docs"],
    });
    expect(capability?.skills.map((item) => item.name)).toEqual(["publish", "review", "write"]);
    expect(capability?.assets.map((item) => item.path)).toEqual(["skills/publish/template.md"]);
    expect(capability?.source).toMatchObject({ format: "agent-plugins", formatVersion: "1.0" });
  });

  test("an invalid skill is excluded with a warning", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest(),
      "skills/good/SKILL.md": skill("good"),
      "skills/bad/SKILL.md": skill("other-name"),
    });
    expect(capability?.skills.map((item) => item.name)).toEqual(["good"]);
    expect(diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["warn", "acf.source.component-invalid"],
    ]);
  });

  test("an invalid mcp.json disables only MCP", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest(),
      "skills/good/SKILL.md": skill("good"),
      "mcp.json": JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: [] }),
    });
    expect(capability?.skills).toHaveLength(1);
    expect(capability?.mcp).toBeUndefined();
    expect(diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["warn", "acf.source.component-invalid"],
    ]);
  });

  test("an unknown author key fails the package", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest({ author: { name: "Ada", twitter: "@ada" } }),
    });
    expect(capability).toBeUndefined();
    expect(diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["error", "acf.source.manifest-invalid"],
    ]);
  });

  test("a 1.1 manifest is refused as an unsupported format version", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json",
        name: "docs-kit",
      }),
    });
    expect(capability).toBeUndefined();
    expect(diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["error", "acf.source.format-version-unsupported"],
    ]);
  });

  test("stdio servers map placeholders and default cwd to the capability directory", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest(),
      "mcp.json": mcp({
        local: {
          type: "stdio",
          command: "./bin/server",
          args: ["--root", `${DOLLAR}{PLUGIN_ROOT}/data`, "--cache", `${DOLLAR}{PLUGIN_DATA}`],
          env: { LOG: `${DOLLAR}{PLUGIN_DATA}/log` },
        },
        pinned: { type: "stdio", command: "node", cwd: `${DOLLAR}{PLUGIN_DATA}` },
        remote: { type: "streamable-http", url: "https://mcp.example.com/mcp" },
      }),
    });
    expect(diagnostics).toEqual([]);
    expect(capability?.mcp?.servers).toEqual([
      {
        name: "local",
        transport: "stdio",
        command: `${DOLLAR}{ACF_CAPABILITY_DIR}/bin/server`,
        cwd: `${DOLLAR}{ACF_CAPABILITY_DIR}`,
        args: [
          "--root",
          `${DOLLAR}{ACF_CAPABILITY_DIR}/data`,
          "--cache",
          `${DOLLAR}{ACF_DATA_DIR}`,
        ],
        env: { LOG: `${DOLLAR}{ACF_DATA_DIR}/log` },
      },
      { name: "pinned", transport: "stdio", command: "node", cwd: `${DOLLAR}{ACF_DATA_DIR}` },
      { name: "remote", transport: "http", url: "https://mcp.example.com/mcp" },
    ]);
  });

  test("a server with an unknown placeholder is kept whole as remainder", async () => {
    const { capability } = await read({
      "plugin.json": manifest(),
      "mcp.json": mcp({ tokened: { type: "stdio", command: "tool", args: [`${DOLLAR}{TOKEN}`] } }),
    });
    expect(capability?.mcp?.servers).toEqual([]);
    expect(capability?.remainder).toEqual([
      expect.objectContaining({
        format: "agent-plugins",
        kind: "mcp-server",
        name: "tokened",
        paths: ["mcp.json"],
        executable: true,
      }),
    ]);
  });

  test("an invalid server is excluded and the rest load", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest(),
      "mcp.json": mcp({
        ok: { type: "stdio", command: "tool" },
        insecure: { type: "sse", url: "http://example.com/sse" },
      }),
    });
    expect(capability?.mcp?.servers.map((item) => item.name)).toEqual(["ok"]);
    expect(diagnostics.map((item) => item.code)).toEqual(["acf.source.component-invalid"]);
  });

  test("unknown root keys and extensions are preserved as Agent Plugins extras", async () => {
    const { capability, diagnostics } = await read({
      "plugin.json": manifest({
        flavor: "mint",
        extensions: { "com.example.tool": { mode: "fast" } },
      }),
      "com.example.tool/config.json": "{}\n",
    });
    expect(diagnostics.map((item) => [item.severity, item.code])).toEqual([
      ["warn", "acf.source.manifest-key-unknown"],
    ]);
    expect(nativeExtras(capability?.manifest.targets, "agent-plugins")).toEqual({
      flavor: "mint",
      extensions: { "com.example.tool": { mode: "fast" } },
    });
    expect(capability?.remainder).toEqual([
      expect.objectContaining({
        format: "agent-plugins",
        kind: "extension-namespace",
        name: "com.example.tool",
        paths: ["com.example.tool"],
      }),
    ]);
  });

  test("a name outside the slug grammar fails and recommends rename", async () => {
    const failed = await read({ "plugin.json": manifest({ name: "acme.docs" }) });
    expect(failed.capability).toBeUndefined();
    expect(failed.diagnostics[0]?.code).toBe("acf.manifest.invalid-name");
    expect(failed.diagnostics[0]?.data).toMatchObject({ suggestedRename: "acme-docs" });

    const renamed = await read(
      { "plugin.json": manifest({ name: "acme.docs" }) },
      {
        rename: "acme-docs",
      },
    );
    expect(renamed.capability?.manifest.name).toBe("acme-docs");
  });

  test("a non-SemVer version falls back to an unversioned version", async () => {
    const { capability } = await read(
      { "plugin.json": manifest({ version: "2024.1" }) },
      { revision: "abc123" },
    );
    expect(capability?.manifest.version).toBe("0.0.0-unversioned+abc123");
    expect(packageValues(capability?.manifest ?? {}, "agent-plugins")).toEqual({
      version: "2024.1",
    });
  });
});
