import { expect, test } from "bun:test";
import path from "node:path";
import type { AcfCapability, EmitResult, McpServer, TargetAdapter } from "@caplet/core";
import { assertGoldenTree, type GoldenTree, goldenCase, treeFromFiles } from "@caplet/golden";
import { claudeAdapter, codexAdapter, cursorAdapter, opencodeAdapter, piAdapter } from "../src";
import { CAP_ROOT, capabilityModel, emitModel, PROJECT, skillFacet } from "./util/model";

const testsDir = import.meta.dir;

// Built from parts: biome forbids `${...}` inside plain string literals.
const DOLLAR = "$";
const CAPABILITY_DIR = `${DOLLAR}{ACF_CAPABILITY_DIR}`;
const DATA_DIR = `${DOLLAR}{ACF_DATA_DIR}`;

const writers: Record<string, { adapter: TargetAdapter; root: string }> = {
  claude: { adapter: claudeAdapter, root: ".claude" },
  codex: { adapter: codexAdapter, root: ".codex" },
  cursor: { adapter: cursorAdapter, root: ".cursor" },
  opencode: { adapter: opencodeAdapter, root: ".opencode" },
  pi: { adapter: piAdapter, root: ".pi" },
};

/** Every selected target of a project that writes all five; all but Claude read `.agents/skills`. */
const allReaders = ["codex", "cursor", "opencode", "pi"];

/** Skills that exercise every row of the skill support table. */
const skillsCapability = capabilityModel({
  skills: [
    skillFacet({
      name: "review",
      description: "Review a change",
      license: "MIT",
      compatibility: "Requires git",
      metadata: { owner: "platform" },
      "argument-hint": "[branch]",
      targets: {
        claude: { native: { "allowed-tools": "Bash(git:*)", when_to_use: "before merging" } },
      },
    }),
    skillFacet({ name: "deploy", description: "Deploy the service", invocation: { model: false } }),
    skillFacet({
      name: "background",
      description: "House conventions",
      invocation: { user: false },
    }),
  ],
});

/** Servers that exercise the MCP support table, including a Codex-only extra. */
const mcpCapability = capabilityModel({
  servers: [
    {
      name: "tools",
      transport: "stdio",
      command: `${CAPABILITY_DIR}/bin/server`,
      args: ["--cache", `${DATA_DIR}/cache`],
      env: { LOG: "info" },
      targets: { codex: { native: { required: true } } },
    },
    {
      name: "docs",
      transport: "http",
      url: "https://mcp.example.com/docs",
      headers: { "X-Client": "caplet" },
    },
    { name: "events", transport: "sse", url: "https://mcp.example.com/events" },
  ] satisfies McpServer[],
});

/** Emitted files relative to the project (relative diff paths already are), plus the report. */
function goldenTree(result: EmitResult): GoldenTree {
  const files: Record<string, string> = {};
  for (const diff of result.diffs) {
    if (diff.after === null) continue;
    if (typeof diff.after !== "string") throw new Error(`${diff.path} is binary`);
    const relative = path.isAbsolute(diff.path) ? path.relative(PROJECT, diff.path) : diff.path;
    if (relative.startsWith("..")) throw new Error(`${diff.path} is outside ${PROJECT}`);
    files[relative] = diff.after;
  }
  const report = { diagnostics: result.diagnostics, outcomes: result.outcomes ?? [] };
  files["report.json"] = `${JSON.stringify(report, null, 2)}\n`;
  return treeFromFiles(files);
}

async function emitFor(
  target: string,
  capability: AcfCapability,
  readers: string[],
): Promise<EmitResult> {
  const writer = writers[target];
  if (writer === undefined) throw new Error(`unknown writer ${target}`);
  return await emitModel(writer.adapter, capability, path.join(PROJECT, writer.root), {
    carrier: "loose",
    canonicalSkillReaders: readers,
  });
}

for (const target of Object.keys(writers)) {
  test(`skills golden for ${target} in a project selecting every target`, async () => {
    const result = await emitFor(target, skillsCapability, allReaders);
    await assertGoldenTree(goldenTree(result), goldenCase(testsDir, `skills-${target}`).expected);
  });

  test(`MCP golden for ${target}`, async () => {
    const result = await emitFor(target, mcpCapability, [target]);
    await assertGoldenTree(goldenTree(result), goldenCase(testsDir, `mcp-${target}`).expected);
  });
}

test("MCP golden for an Agent Plugins server with cwd refused for Claude", async () => {
  const capability = capabilityModel({
    servers: [
      {
        name: "plugin-server",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        cwd: CAPABILITY_DIR,
      },
    ],
    source: { format: "agent-plugins", formatVersion: "1.0", path: ".", snapshotRoot: CAP_ROOT },
  });
  const result = await emitFor("claude", capability, []);
  expect(result.diffs).toEqual([]);
  await assertGoldenTree(
    goldenTree(result),
    goldenCase(testsDir, "mcp-agent-plugins-cwd-claude").expected,
  );
});
