import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import type { ComponentOutcome } from "@caplet/core";
import { assertGoldenTree, goldenCase, treeFromFiles } from "@caplet/golden";
import { renderCompatibility } from "../../src/internal/compatibility.js";
import { stripAnsi } from "../../src/internal/render.js";
import { cleanup, makeScope, runCaplet, type TestScope, writeText } from "../helpers.js";

const testsDir = path.resolve(import.meta.dir, "..");

/**
 * One of every outcome kind, so the renderer is pinned independently of which outcomes the
 * writers happen to produce for the fixture capabilities.
 */
const constructed: ComponentOutcome[] = [
  {
    capability: "tools",
    target: "claude",
    family: "skill",
    component: "review",
    outcome: "native",
  },
  { capability: "tools", target: "claude", family: "mcp", component: "docs", outcome: "native" },
  {
    capability: "tools",
    target: "claude",
    family: "agent",
    component: "helper",
    outcome: "native",
  },
  {
    capability: "tools",
    target: "opencode",
    family: "mcp",
    component: "docs",
    outcome: "translated",
    source: "mcp.transport=stdio",
    consequence: "written as type: local with a command array",
  },
  {
    capability: "tools",
    target: "opencode",
    family: "skill",
    component: "review",
    outcome: "native",
    dropped: ["skill.argument-hint"],
  },
  {
    capability: "tools",
    target: "opencode",
    family: "agent",
    component: "helper",
    outcome: "changed-behavior",
    source: "targets.claude.native.permissionMode",
    consequence: "agent helper runs without permissionMode on opencode",
    recovery: "exclude: { agents: [helper] } or except: [opencode]",
  },
  {
    capability: "tools",
    target: "pi",
    family: "skill",
    component: "review",
    outcome: "blocked",
    source: "skill.invocation.user=false",
    consequence: "skill review is not installed for pi",
    recovery: "exclude: { skills: [review] } or except: [pi]",
    dropped: ["skill.argument-hint"],
  },
  {
    capability: "tools",
    target: "pi",
    family: "agent",
    component: "helper",
    outcome: "omitted",
    source: "agent",
    consequence: "agent helper is not installed for pi",
    recovery: "exclude: { agents: [helper] } or except: [pi]",
  },
  { capability: "tools", target: "pi", family: "mcp", component: "docs", outcome: "native" },
  {
    capability: "tools",
    target: "pi",
    family: "package",
    component: "tools",
    outcome: "native",
    dropped: ["native/claude/"],
  },
];

function plain(lines: readonly string[]): string {
  return `${lines.map(stripAnsi).join("\n")}\n`;
}

describe("behavior-first compatibility report", () => {
  test("renders every outcome kind per target", async () => {
    const report = plain(renderCompatibility(constructed, ["claude", "opencode", "pi"]));
    await assertGoldenTree(
      treeFromFiles({ "report.txt": report }),
      goldenCase(testsDir, "compatibility-report").expected,
    );
  });

  test("a refused skill reads as a block with its recovery", () => {
    const report = plain(renderCompatibility(constructed, ["pi"]));
    expect(report).toContain(
      "review / pi - blocked: skill review is not installed for pi (skill.invocation.user=false). Recovery: exclude: { skills: [review] } or except: [pi]",
    );
  });

  test("names the capability when the report spans several", () => {
    const other = constructed.map((item) => ({ ...item, capability: "other" }));
    const report = plain(renderCompatibility([...constructed, ...other], ["pi"]));
    expect(report).toContain("review (tools) / pi - blocked:");
    expect(report).toContain("review (other) / pi - blocked:");
  });
});

describe("caplet apply --dry-run compatibility report", () => {
  let scope: TestScope;
  beforeEach(async () => {
    scope = await makeScope();
  });
  afterEach(async () => {
    await cleanup(scope);
  });

  /** Runs `apply --dry-run` for `target`; refused components make the plan exit 2. */
  async function dryRun(
    target: string,
    exitCode = 0,
  ): Promise<{ stdout: string; outcomes: string }> {
    const args = [
      "apply",
      "--dry-run",
      "--cwd",
      scope.cwd,
      "--scope",
      "project",
      "--target",
      target,
    ];
    const human = await runCaplet(scope, args);
    expect(human.exitCode).toBe(exitCode);
    const json = await runCaplet(scope, [...args, "--json"]);
    expect(json.exitCode).toBe(exitCode);
    const parsed = JSON.parse(json.stdout) as { outcomes: unknown };
    return {
      stdout: human.stdout.replaceAll(scope.dir, "<tmp>"),
      outcomes: `${JSON.stringify(parsed.outcomes, null, 2)}\n`,
    };
  }

  test("native components on Claude, before the file list", async () => {
    const result = await dryRun("claude");
    expect(result.stdout.indexOf("claude - native:")).toBeLessThan(result.stdout.indexOf("Plan:"));
    await assertGoldenTree(
      treeFromFiles({ "stdout.txt": result.stdout, "outcomes.json": result.outcomes }),
      goldenCase(testsDir, "apply-native-claude").expected,
    );
  });

  test("translated, blocked and dropped components on Codex", async () => {
    const capabilityDir = ["$", "{ACF_CAPABILITY_DIR}"].join("");
    const alpha = path.join(scope.sourceRoot, "alpha");
    const beta = path.join(scope.sourceRoot, "beta");
    await writeText(
      path.join(beta, "skills", "background", "SKILL.md"),
      "---\nname: background\ndescription: House conventions\ninvocation:\n  user: false\n---\nConventions.\n",
    );
    await writeText(
      path.join(alpha, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review a change\ntargets:\n  claude:\n    native:\n      when_to_use: before merging\n---\nReview.\n",
    );
    await writeText(
      path.join(alpha, "mcp", "mcp.yml"),
      `servers:\n  - name: alpha-server\n    transport: stdio\n    command: "${capabilityDir}/bin/server"\n`,
    );
    await writeText(
      path.join(beta, "mcp", "mcp.yml"),
      "servers:\n  - name: beta-server\n    transport: stdio\n    command: node\n  - name: events\n    transport: sse\n    url: https://mcp.example.com/events\n",
    );
    const result = await dryRun("codex", 2);
    for (const outcome of ["translated", "blocked", "dropped"])
      expect(result.stdout).toContain(` - ${outcome}: `);
    await assertGoldenTree(
      treeFromFiles({ "stdout.txt": result.stdout, "outcomes.json": result.outcomes }),
      goldenCase(testsDir, "apply-translated-blocked-codex").expected,
    );
  });

  test("components Cursor cannot carry are listed as omitted", async () => {
    const result = await dryRun("cursor");
    expect(result.stdout).toContain(" / cursor - omitted: ");
    await assertGoldenTree(
      treeFromFiles({ "stdout.txt": result.stdout, "outcomes.json": result.outcomes }),
      goldenCase(testsDir, "apply-omitted-cursor").expected,
    );
  });
});

test("add and update report compatibility like apply, also for a plan without files", async () => {
  const scope = await makeScope();
  try {
    const gamma = path.join(scope.sourceRoot, "gamma");
    await writeText(path.join(gamma, "acf.yml"), "acf: 1\nname: gamma-cap\nversion: 1.0.0\n");
    await writeText(
      path.join(gamma, "mcp", "mcp.yml"),
      "servers:\n  - name: events\n    transport: sse\n    url: https://mcp.example.com/events\n",
    );
    const flags = ["--cwd", scope.cwd, "--scope", "project", "--target", "codex"];
    const blocked = "events (gamma-cap) / codex - blocked: ";

    const added = await runCaplet(scope, ["add", `path:${gamma}`, ...flags]);
    expect(added.exitCode).toBe(2);
    expect(added.stdout.indexOf(blocked)).toBeGreaterThan(-1);
    expect(added.stdout.indexOf(blocked)).toBeLessThan(added.stdout.indexOf("Plan:"));

    const updated = await runCaplet(scope, ["update", ...flags]);
    expect(updated.exitCode).toBe(2);
    expect(updated.stdout).toContain(blocked);
    const json = await runCaplet(scope, ["update", ...flags, "--json"]);
    const parsed = JSON.parse(json.stdout) as {
      outcomes: Array<{ component: string; outcome: string }>;
    };
    expect(parsed.outcomes).toContainEqual(
      expect.objectContaining({ component: "events", outcome: "blocked" }),
    );
  } finally {
    await cleanup(scope);
  }
});
