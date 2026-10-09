import { expect, test } from "bun:test";
import path from "node:path";
import { pluginPackageDir, readClaudePluginPackage } from "@caplet/core";
import { claudeAdapter, codexAdapter } from "../src";
import { claudeAuthor } from "../src/claude/manifest";
import { makeInMemoryFs } from "./util/in-memory-fs";
import { CAP_ROOT, capabilityModel, emitModel, PROJECT, skillFacet } from "./util/model";
import { withTempPackage } from "./util/temp-package";

const INSTALL_ROOT = path.join(PROJECT, ".claude");

test("an ACF capability with a skill and a server becomes one Claude plugin", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review a change" })],
    servers: [{ name: "tools", transport: "stdio", command: "node", args: ["server.js"] }],
  });
  capability.manifest = { ...capability.manifest, name: "review", version: "1.2.0" };
  const result = await emitModel(
    claudeAdapter,
    capability,
    INSTALL_ROOT,
    {},
    {
      [path.join(CAP_ROOT, "server.js")]: "console.log('hi')\n",
    },
  );
  const dir = pluginPackageDir(INSTALL_ROOT, "review");
  expect(result.plugins).toHaveLength(1);
  expect(result.plugins?.[0]?.dir).toBe(dir);
  expect(result.plugins?.[0]?.version).toMatch(/^1\.2\.0\+acf\.[0-9a-f]{12}$/);
  const paths = result.diffs.map((diff) => path.relative(dir, diff.path)).sort();
  expect(paths).toEqual([
    ".claude-plugin/plugin.json",
    ".mcp.json",
    "server.js",
    "skills/review/SKILL.md",
  ]);
});

test("the plugin version counts a file as executable by its owner execute bit alone", async () => {
  const version = async (mode: number): Promise<string | undefined> => {
    const capability = capabilityModel({
      skills: [skillFacet({ name: "review", description: "Review a change" })],
    });
    const fs = makeInMemoryFs({
      [path.join(CAP_ROOT, "tool.sh")]: { content: "#!/bin/sh\n", mode },
    });
    const result = await claudeAdapter.emit(
      { capability, scope: "project", installRoot: INSTALL_ROOT, options: {} },
      fs,
    );
    return result.plugins?.[0]?.version;
  };
  expect(await version(0o654)).toBe(await version(0o644));
  expect(await version(0o744)).not.toBe(await version(0o644));
});

test("a stdio command under the data directory runs from Claude's plugin data directory", async () => {
  // Built from parts: biome forbids `${...}` inside plain string literals.
  const dataDir = `${"$"}{ACF_DATA_DIR}`;
  const capability = capabilityModel({
    skills: [skillFacet({ name: "store", description: "Store" })],
    servers: [{ name: "store", transport: "stdio", command: `${dataDir}/bin/store` }],
  });
  const result = await emitModel(claudeAdapter, capability, INSTALL_ROOT);
  const mcp = result.diffs.find((diff) => diff.path.endsWith("/.mcp.json"));
  const config = JSON.parse(String(mcp?.after)) as {
    mcpServers: Record<string, { command: string }>;
  };
  expect(config.mcpServers.store?.command).toBe(`${"$"}{CLAUDE_PLUGIN_DATA}/bin/store`);
  expect(result.outcomes).toContainEqual(
    expect.objectContaining({ outcome: "translated", source: `mcp.command=${dataDir}` }),
  );
});

test("a loose target reports package-level Claude keys and native/claude/ files as dropped", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review" })],
  });
  capability.manifest = {
    ...capability.manifest,
    targets: { claude: { native: { dependencies: ["helper-plugin"] } } },
  };
  capability.nativeFiles = [
    { target: "claude", path: "output-styles/terse.md", executable: false },
  ];
  const result = await emitModel(codexAdapter, capability, path.join(PROJECT, ".codex"));
  const dropped = result.diagnostics.filter((d) => d.code === "acf.extras.dropped");
  expect(dropped.map((d) => d.message)).toEqual([
    expect.stringContaining("dependencies"),
    expect.stringContaining("native/claude/"),
  ]);
});

test("Claude authors decode only an exact Name <email> string", () => {
  expect(claudeAuthor("Ada Lovelace <ada@example.com>")).toEqual({
    name: "Ada Lovelace",
    email: "ada@example.com",
  });
  for (const raw of [
    "Ada Lovelace  <ada@example.com>",
    " Ada <ada@example.com>",
    "Ada <ada@example.com> (math)",
    "<ada@example.com>",
    "Ada",
  ])
    expect(claudeAuthor(raw)).toEqual({ name: raw });
  expect(claudeAuthor({ name: "Ada", url: "https://ada.example" })).toEqual({
    name: "Ada",
    url: "https://ada.example",
  });
});

test("the Claude author outcome mentions decoding only when a string was decoded", async () => {
  const authorOutcomes = async (author: string | { name: string; email: string }) => {
    const capability = capabilityModel({
      skills: [skillFacet({ name: "review", description: "Review a change" })],
    });
    capability.manifest = { ...capability.manifest, authors: [author] };
    const result = await emitModel(claudeAdapter, capability, INSTALL_ROOT);
    return (result.outcomes ?? [])
      .filter((outcome) => outcome.source?.startsWith("package.authors"))
      .map((outcome) => outcome.consequence);
  };

  expect(await authorOutcomes({ name: "Ada", email: "ada@example.com" })).toEqual([
    "the first entry becomes author",
  ]);
  expect(await authorOutcomes("Ada")).toEqual(["the first entry becomes author"]);
  expect(await authorOutcomes("Ada <ada@example.com>")).toEqual([
    "the first entry becomes author",
    expect.stringContaining("decoded"),
  ]);
});

test("an unchanged Claude plugin without a version gets one inserted and nothing else", async () => {
  const manifest = '{\n  "name": "notes",\n  "description": "Notes"\n}\n';
  const skill = "---\nname: jot\ndescription: Jot a note\n---\nJot it down.\n";
  const files = { ".claude-plugin/plugin.json": manifest, "skills/jot/SKILL.md": skill };
  await withTempPackage("acf-claude-plugin-", files, async (root) => {
    const read = await readClaudePluginPackage(root, {
      scope: "project",
      origin: { kind: "local", directory: root },
      revision: null,
    });
    if (read.capability === undefined) throw new Error("the plugin did not read");
    const result = await emitModel(
      claudeAdapter,
      read.capability,
      INSTALL_ROOT,
      {},
      {
        [path.join(root, ".claude-plugin", "plugin.json")]: manifest,
        [path.join(root, "skills", "jot", "SKILL.md")]: skill,
      },
    );
    const version = result.plugins?.[0]?.version ?? "";
    const dir = pluginPackageDir(INSTALL_ROOT, "notes");
    const files = Object.fromEntries(
      result.diffs.map((diff) => [
        path.relative(dir, diff.path),
        typeof diff.after === "string"
          ? diff.after
          : new TextDecoder().decode(diff.after ?? undefined),
      ]),
    );
    expect(files).toEqual({
      ".claude-plugin/plugin.json": manifest.replace(
        '"description": "Notes"\n',
        `"description": "Notes",\n  "version": ${JSON.stringify(version)}\n`,
      ),
      "skills/jot/SKILL.md": skill,
    });
  });
});

test("an unchanged Claude plugin keeps its manifest's file mode", async () => {
  const manifest = '{\n  "name": "notes",\n  "version": "1.0.0"\n}\n';
  await withTempPackage(
    "acf-claude-plugin-",
    { ".claude-plugin/plugin.json": manifest },
    async (root) => {
      const read = await readClaudePluginPackage(root, {
        scope: "project",
        origin: { kind: "local", directory: root },
        revision: null,
      });
      if (read.capability === undefined) throw new Error("the plugin did not read");
      const manifestPath = path.join(root, ".claude-plugin", "plugin.json");
      const fs = makeInMemoryFs({ [manifestPath]: { content: manifest, mode: 0o755 } });
      const result = await claudeAdapter.emit(
        { capability: read.capability, scope: "project", installRoot: INSTALL_ROOT, options: {} },
        fs,
      );
      expect(result.diffs.map((diff) => diff.afterMode)).toEqual([0o755]);
    },
  );
});

test("a native ACF capability with a skill and a hook stays whole on loose Claude files", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review a change" })],
  });
  capability.hooks = {
    path: "hooks/hooks.yml",
    buckets: { pre_tool: [{ name: "guard", run: { command: "guard" }, effect: "block" }] },
  };
  const result = await emitModel(claudeAdapter, capability, INSTALL_ROOT);
  expect(result.plugins ?? []).toEqual([]);
  expect(result.diagnostics.filter((d) => d.code === "acf.claude.legacy-carrier")).toEqual([
    expect.objectContaining({
      severity: "info",
      data: expect.objectContaining({ families: ["hooks"] }),
    }),
  ]);
  const paths = result.diffs.map((diff) => diff.path);
  expect(paths).toContain(".claude/skills/review/SKILL.md");
  expect(paths.some((p) => p.includes(".acf/marketplace"))).toBe(false);
});

test("skills placement options a Claude plugin cannot honor raise a warning", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "review", description: "Review a change" })],
  });
  for (const skills of [{ canonical: true }, { native: false }]) {
    const result = await emitModel(claudeAdapter, capability, INSTALL_ROOT, { skills });
    expect(result.plugins).toHaveLength(1);
    expect(result.diagnostics.filter((d) => d.code === "acf.claude.skills-option-ignored")).toEqual(
      [expect.objectContaining({ severity: "warn", targetId: "claude" })],
    );
  }
  const honored = await emitModel(claudeAdapter, capability, INSTALL_ROOT, {
    skills: { canonical: false, native: true },
  });
  expect(honored.diagnostics.map((d) => d.code)).not.toContain("acf.claude.skills-option-ignored");
});

test("Agent Plugins remainder is omitted from a Claude plugin, or refuses it when restricting", async () => {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "write", description: "Write docs" })],
    source: { format: "agent-plugins", path: ".", snapshotRoot: CAP_ROOT },
  });
  const server = {
    format: "agent-plugins" as const,
    kind: "mcp-server" as const,
    name: "search",
    paths: ["mcp.json"],
    class: "functional" as const,
    executable: true,
  };
  capability.remainder = [server];
  const omitted = await emitModel(claudeAdapter, capability, INSTALL_ROOT);
  expect(omitted.plugins).toHaveLength(1);
  expect(omitted.diagnostics.map((d) => [d.code, d.severity])).toContainEqual([
    "acf.support.component-omitted",
    "lossy",
  ]);

  capability.remainder = [{ ...server, class: "restricting" }];
  const refused = await emitModel(claudeAdapter, capability, INSTALL_ROOT);
  expect(refused.plugins ?? []).toEqual([]);
  expect(refused.diffs).toEqual([]);
  expect(refused.diagnostics.map((d) => d.code)).toContain("acf.support.refused");
});
