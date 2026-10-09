/**
 * Goldens for the Claude plugin carrier. Each case reads `golden/<case>/input/` with the reader
 * of its format, writes it for Claude, and compares the plugin package (relative to its
 * directory) plus `report.json` with `expected/`.
 */
import { expect, test } from "bun:test";
import path from "node:path";
import {
  type AcfCapability,
  applyEntrySelection,
  type Diagnostic,
  type EmitOptions,
  type EmitResult,
  type ForeignReadResult,
  type ReadOnlyFs,
  readAgentPluginsPackage,
  readCapability,
  readClaudePluginPackage,
  type TargetAdapter,
} from "@caplet/core";
import {
  assertGoldenTree,
  type GoldenTree,
  goldenCase,
  readTree,
  treeFromFileDiffs,
} from "@caplet/golden";
import { claudeAdapter, codexAdapter, cursorAdapter, opencodeAdapter, piAdapter } from "../src";
import { makeInMemoryFs } from "./util/in-memory-fs";
import { withTempPackage } from "./util/temp-package";

const testsDir = import.meta.dir;
const PROJECT = "/project";
const INSTALL_ROOT = path.join(PROJECT, ".claude");

/** The loose-only targets, which report what a Claude plugin carries but they cannot. */
const looseTargets: Record<string, TargetAdapter> = {
  codex: codexAdapter,
  cursor: cursorAdapter,
  opencode: opencodeAdapter,
  pi: piAdapter,
};

type Format = "acf" | "claude-plugin" | "agent-plugins";

async function readInput(input: string, format: Format, rename?: string): Promise<AcfCapability> {
  const origin = { kind: "local" as const, directory: input };
  if (format === "acf") {
    const capability = await readCapability(input, "project", origin);
    expect(problems(capability.diagnostics)).toEqual([]);
    return capability;
  }
  const options = {
    scope: "project" as const,
    origin,
    revision: null,
    ...(rename === undefined ? {} : { rename }),
  };
  const result: ForeignReadResult =
    format === "claude-plugin"
      ? await readClaudePluginPackage(input, options)
      : await readAgentPluginsPackage(input, options);
  expect(problems(result.diagnostics)).toEqual([]);
  if (result.capability === undefined) throw new Error("the input package did not read");
  return result.capability;
}

/** Warnings and errors, which mean the input is not the package the case describes. */
function problems(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "warn" || diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.message);
}

/** The input tree as the writer's file system, at its real absolute paths. */
async function inputFs(input: string): Promise<ReadOnlyFs> {
  const files: Record<string, { content: Uint8Array; mode: number }> = {};
  for (const [relativePath, file] of await readTree(input))
    files[path.join(input, relativePath)] = {
      content: file.bytes,
      mode: file.executable ? 0o755 : 0o644,
    };
  return makeInMemoryFs(files);
}

async function emit(
  adapter: TargetAdapter,
  capability: AcfCapability,
  installRoot: string,
  fs: ReadOnlyFs,
  options: EmitOptions = {},
): Promise<EmitResult> {
  return await adapter.emit({ capability, scope: "project", installRoot, options }, fs);
}

/**
 * The plugin package relative to its directory, and `report.json` with the writer's plugins,
 * diagnostics and outcomes plus `others`; the input path reads as `<input>`.
 */
function pluginTree(
  result: EmitResult,
  input: string,
  others: Record<string, unknown> = {},
): GoldenTree {
  const dir = result.plugins?.[0]?.dir;
  const tree = dir === undefined ? new Map() : treeFromFileDiffs(result.diffs, dir);
  if (dir === undefined) expect(result.diffs).toEqual([]);
  const report = {
    plugins: (result.plugins ?? []).map((plugin) => ({
      ...plugin,
      dir: path.relative(PROJECT, plugin.dir),
    })),
    diagnostics: result.diagnostics,
    outcomes: result.outcomes ?? [],
    ...others,
  };
  const text = JSON.stringify(report, null, 2).replaceAll(input, "<input>");
  tree.set("report.json", { bytes: new TextEncoder().encode(`${text}\n`), executable: false });
  return tree;
}

/** What each loose target reports for `capability`: only its package-level drops. */
async function looseDrops(
  capability: AcfCapability,
  fs: ReadOnlyFs,
): Promise<Record<string, unknown>> {
  const drops: Record<string, unknown> = {};
  for (const [id, adapter] of Object.entries(looseTargets)) {
    const result = await emit(adapter, capability, path.join(PROJECT, `.${id}`), fs);
    drops[id] = result.diagnostics
      .filter((diagnostic) => diagnostic.code === "acf.extras.dropped")
      .map((diagnostic) => diagnostic.message);
  }
  return { otherTargets: drops };
}

async function nativeCase(name: string, withOthers = false): Promise<void> {
  const golden = goldenCase(testsDir, name);
  const capability = await readInput(golden.input, "acf");
  const fs = await inputFs(golden.input);
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, fs);
  const others = withOthers ? await looseDrops(capability, fs) : {};
  await assertGoldenTree(pluginTree(result, golden.input, others), golden.expected);
}

/** The JSON object in `file` of `tree`. */
function treeJson(tree: GoldenTree, file: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(tree.get(file)?.bytes)) as Record<string, unknown>;
}

test("an ACF capability becomes a Claude plugin with its native/claude/ files", async () => {
  await nativeCase("claude-plugin-acf");
});

test("targets.claude.native.dependencies reaches plugin.json and is dropped elsewhere", async () => {
  await nativeCase("claude-plugin-dependencies", true);
});

test("a native/claude/ output style is copied into the plugin and dropped elsewhere", async () => {
  await nativeCase("claude-plugin-output-style", true);
});

test("the first author becomes the Claude author and the rest are reported", async () => {
  await nativeCase("claude-plugin-authors");
});

test("an unchanged Claude plugin is copied byte for byte apart from its version", async () => {
  const golden = goldenCase(testsDir, "claude-plugin-unchanged");
  const capability = await readInput(golden.input, "claude-plugin");
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(golden.input));
  await assertGoldenTree(pluginTree(result, golden.input), golden.expected);
});

test("a renamed Claude plugin without an excluded skill is regenerated around its remainder", async () => {
  const golden = goldenCase(testsDir, "claude-plugin-transformed");
  const selected = applyEntrySelection(
    await readInput(golden.input, "claude-plugin", "code-review"),
    { exclude: { skills: ["triage"] } },
  );
  const result = await emit(
    claudeAdapter,
    selected.capability,
    INSTALL_ROOT,
    await inputFs(golden.input),
  );
  await assertGoldenTree(
    pluginTree(result, golden.input, { selection: selected.diagnostics }),
    golden.expected,
  );
});

test("a Claude plugin leaves out the files and manifest entries of excluded components", async () => {
  const files: Record<string, string> = {
    ".claude-plugin/plugin.json": `${JSON.stringify({
      name: "kit",
      version: "1.0.0",
      agents: ["./agents/keep.md", "./agents/drop.md"],
      hooks: "./hooks/hooks.json",
    })}\n`,
    "agents/keep.md": "---\nname: keep\ndescription: Kept\n---\nKeep.\n",
    "agents/drop.md": "---\nname: drop\ndescription: Dropped\n---\nDrop.\n",
    "hooks/hooks.json": `${JSON.stringify({ hooks: {} })}\n`,
    "skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\nReview.\n",
  };
  await withTempPackage("claude-selected-", files, async (input) => {
    const selected = applyEntrySelection(await readInput(input, "claude-plugin"), {
      exclude: { agents: ["drop"], hooks: ["hooks"] },
    });

    const result = await emit(
      claudeAdapter,
      selected.capability,
      INSTALL_ROOT,
      await inputFs(input),
    );

    const tree = pluginTree(result, input);
    expect([...tree.keys()].sort()).toEqual([
      ".claude-plugin/plugin.json",
      "agents/keep.md",
      "report.json",
      "skills/review/SKILL.md",
    ]);
    const manifest = treeJson(tree, ".claude-plugin/plugin.json");
    expect(manifest.agents).toEqual(["./agents/keep.md"]);
    expect(manifest.hooks).toBeUndefined();
  });
});

test("a transformed Claude plugin keeps undeclared SKILL.md directories and drops excluded skills", async () => {
  const skill = (name: string): string => `---\nname: ${name}\ndescription: ${name}\n---\nBody.\n`;
  const files: Record<string, string> = {
    ".claude-plugin/plugin.json": `${JSON.stringify({ name: "kit", version: "1.0.0", skills: "./extra" })}\n`,
    "skills/review/SKILL.md": skill("review"),
    "skills/drop/SKILL.md": skill("drop"),
    "skills/drop/notes.md": "Dropped notes.\n",
    "extra/triage/SKILL.md": skill("triage"),
    "docs/example/SKILL.md": skill("example"),
    "docs/example/notes.md": "How the example works.\n",
  };
  await withTempPackage("claude-skill-dirs-", files, async (input) => {
    const selected = applyEntrySelection(await readInput(input, "claude-plugin"), {
      exclude: { skills: ["drop", "triage"] },
    });

    const result = await emit(
      claudeAdapter,
      selected.capability,
      INSTALL_ROOT,
      await inputFs(input),
    );

    expect([...pluginTree(result, input).keys()].sort()).toEqual([
      ".claude-plugin/plugin.json",
      "docs/example/SKILL.md",
      "docs/example/notes.md",
      "report.json",
      "skills/review/SKILL.md",
    ]);
  });
});

test("an Agent Plugins package is translated into a Claude plugin", async () => {
  const golden = goldenCase(testsDir, "agent-plugins-claude");
  const capability = await readInput(golden.input, "agent-plugins");
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(golden.input));
  await assertGoldenTree(pluginTree(result, golden.input), golden.expected);
});

test("an Agent Plugins package leaves out the Claude configuration Claude would discover", async () => {
  const schema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
  const files: Record<string, string> = {
    "plugin.json": `${JSON.stringify({ $schema: schema, name: "kit", version: "1.0.0" })}\n`,
    ".claude-plugin/plugin.json": `${JSON.stringify({ name: "kit", hooks: "./hooks/hooks.json" })}\n`,
    ".mcp.json": `${JSON.stringify({ mcpServers: { run: { command: "./run.sh" } } })}\n`,
    "agents/helper.md": "---\nname: helper\ndescription: Helper\n---\nHelp.\n",
    "hooks/hooks.json": `${JSON.stringify({ hooks: {} })}\n`,
    "settings.json": `${JSON.stringify({ agent: "helper" })}\n`,
    "run.sh": "#!/bin/sh\n",
    "skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\nReview.\n",
  };
  await withTempPackage("agent-plugins-claude-files-", files, async (input) => {
    const capability = await readInput(input, "agent-plugins");

    const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(input));

    expect([...pluginTree(result, input).keys()].sort()).toEqual([
      ".claude-plugin/plugin.json",
      "report.json",
      "run.sh",
      "skills/review/SKILL.md",
    ]);
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code === "acf.claude.plugin-file-ignored")
        .map((diagnostic) => [diagnostic.severity, path.relative(input, diagnostic.path ?? "")]),
    ).toEqual([
      ["info", ".claude-plugin"],
      ["info", ".mcp.json"],
      ["info", "agents"],
      ["info", "hooks/hooks.json"],
      ["info", "settings.json"],
    ]);
  });
});

test("a transformed Claude plugin keeps its selected MCP bundle references and bundle files", async () => {
  const remote = "https://example.com/remote.mcpb";
  const files: Record<string, string> = {
    ".claude-plugin/plugin.json": `${JSON.stringify({
      name: "kit",
      version: "1.0.0",
      mcpServers: ["./mcp/extra.json", "./bundles/tool.mcpb", "./bundles/other.mcpb", remote],
    })}\n`,
    ".mcp.json": `${JSON.stringify({ mcpServers: { local: { command: "node", args: ["server.js"] } } })}\n`,
    "mcp/extra.json": `${JSON.stringify({ mcpServers: { extra: { type: "http", url: "https://example.com/mcp" } } })}\n`,
    "bundles/tool.mcpb": "tool bundle",
    "bundles/other.mcpb": "other bundle",
    "skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\nReview.\n",
  };
  await withTempPackage("claude-bundles-", files, async (input) => {
    const selected = applyEntrySelection(await readInput(input, "claude-plugin", "kit2"), {
      exclude: { mcp: ["./bundles/other.mcpb"] },
    });

    const result = await emit(
      claudeAdapter,
      selected.capability,
      INSTALL_ROOT,
      await inputFs(input),
    );

    const tree = pluginTree(result, input);
    expect([...tree.keys()].sort()).toEqual([
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "bundles/tool.mcpb",
      "report.json",
      "skills/review/SKILL.md",
    ]);
    expect(treeJson(tree, ".claude-plugin/plugin.json").mcpServers).toEqual([
      "./bundles/tool.mcpb",
      remote,
    ]);
    expect(Object.keys(treeJson(tree, ".mcp.json").mcpServers as object).sort()).toEqual([
      "extra",
      "local",
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "acf.support.component-omitted",
    );
  });
});

test("a transformed Claude plugin keeps a native server declared inline in a manifest mcpServers list", async () => {
  const helper = { type: "http", url: "https://example.com/mcp", headersHelper: "./auth.sh" };
  const files: Record<string, string> = {
    ".claude-plugin/plugin.json": `${JSON.stringify({
      name: "kit",
      version: "1.0.0",
      mcpServers: [{ helper: { ...helper, url: "https://example.com/old" } }, { helper }],
    })}\n`,
    "skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\nReview.\n",
  };
  await withTempPackage("claude-inline-list-", files, async (input) => {
    const capability = await readInput(input, "claude-plugin", "kit2");

    const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(input));

    expect(treeJson(pluginTree(result, input), ".mcp.json").mcpServers).toEqual({ helper });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "acf.support.component-omitted",
    );
  });
});

test("an excluded command of a manifest commands map leaves the regenerated manifest", async () => {
  const safe = { source: "./cmds/safe.md", description: "Safe" };
  const files: Record<string, string> = {
    ".claude-plugin/plugin.json": `${JSON.stringify({
      name: "kit",
      version: "1.0.0",
      commands: { danger: { content: "Delete everything", allowedTools: ["Bash"] }, safe },
    })}\n`,
    "cmds/safe.md": "Safe\n",
    "cmds/danger-notes.md": "Notes\n",
    "skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\nReview.\n",
  };
  await withTempPackage("claude-command-map-", files, async (input) => {
    const selected = applyEntrySelection(await readInput(input, "claude-plugin"), {
      exclude: { commands: ["danger"] },
    });
    expect(selected.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "acf.selection.unmatched",
    );

    const result = await emit(
      claudeAdapter,
      selected.capability,
      INSTALL_ROOT,
      await inputFs(input),
    );

    const tree = pluginTree(result, input);
    const manifest = treeJson(tree, ".claude-plugin/plugin.json");
    expect(manifest.commands).toEqual({ safe });
    expect(tree.has("cmds/safe.md")).toBe(true);
  });
});

test("a Claude plugin with remainder is refused on loose Claude files", async () => {
  const golden = goldenCase(testsDir, "claude-plugin-loose-refused");
  const capability = await readInput(golden.input, "claude-plugin");
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(golden.input), {
    carrier: "loose",
  });
  await assertGoldenTree(pluginTree(result, golden.input), golden.expected);
});

test("a renamed Claude plugin and native ACF authoring the same content write the same plugin", async () => {
  const fixtures = path.join(testsDir, "fixtures", "claude-parity");
  const trees: GoldenTree[] = [];
  for (const [input, format, rename] of [
    [path.join(fixtures, "claude"), "claude-plugin", "notes-kit"],
    [path.join(fixtures, "acf"), "acf", undefined],
  ] as const) {
    const capability = await readInput(input, format, rename);
    const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(input));
    const dir = result.plugins?.[0]?.dir;
    if (dir === undefined) throw new Error(`${format} wrote no plugin`);
    trees.push(treeFromFileDiffs(result.diffs, dir));
  }
  const [foreign, native] = trees;
  // The version digest covers the generated package, so equal trees give equal versions too.
  expect(foreign).toEqual(native);
  expect([...(native?.keys() ?? [])].sort()).toEqual([
    ".claude-plugin/plugin.json",
    ".mcp.json",
    "agents/reviewer.md",
    "bin/search",
    "output-styles/terse.md",
    "skills/jot/SKILL.md",
    "skills/jot/template.md",
  ]);
});
