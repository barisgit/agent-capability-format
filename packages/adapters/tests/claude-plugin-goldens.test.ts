/**
 * Goldens for the Claude plugin carrier. Each case reads `golden/<case>/input/` with the reader
 * of its format, writes it for Claude, and compares the plugin package (relative to its
 * directory) plus `report.json` with `expected/`.
 */
import { expect, test } from "bun:test";
import path from "node:path";
import {
  type AcfCapability,
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
  const capability = await readInput(golden.input, "claude-plugin", "code-review");
  // Facet selection is applied before writers run; the writer sees the remaining skills.
  capability.skills = capability.skills.filter((skill) => skill.name !== "triage");
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(golden.input));
  await assertGoldenTree(pluginTree(result, golden.input), golden.expected);
});

test("an Agent Plugins package is translated into a Claude plugin", async () => {
  const golden = goldenCase(testsDir, "agent-plugins-claude");
  const capability = await readInput(golden.input, "agent-plugins");
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(golden.input));
  await assertGoldenTree(pluginTree(result, golden.input), golden.expected);
});

test("a Claude plugin with remainder is refused on loose Claude files", async () => {
  const golden = goldenCase(testsDir, "claude-plugin-loose-refused");
  const capability = await readInput(golden.input, "claude-plugin");
  const result = await emit(claudeAdapter, capability, INSTALL_ROOT, await inputFs(golden.input), {
    carrier: "loose",
  });
  await assertGoldenTree(pluginTree(result, golden.input), golden.expected);
});
