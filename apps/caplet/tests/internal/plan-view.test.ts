import { expect, test } from "bun:test";
import path from "node:path";
import { type FileDiff, scopeRoot } from "@acf/core";
import { renderPlan } from "../../src/internal/output";
import { buildPlanView, planToJson } from "../../src/internal/plan-view";
import type { EmittedDiff } from "../../src/internal/workflow";

function diff(options: {
  scope: "user" | "project";
  agentsDir: string;
  target: string;
  destination: "canonical" | "native";
  installRoot: string;
  capability: string;
  file: string;
  action?: "create" | "update" | "delete";
  notice?: boolean;
}): EmittedDiff {
  const action = options.action ?? "create";
  const fileDiff: FileDiff = {
    path: path.join(options.installRoot, options.file),
    before: action === "create" ? null : "old",
    after: action === "delete" ? null : "new",
    ...(options.notice === true ? { managementNotice: { kind: "install-root" } } : {}),
  } as FileDiff;
  return {
    scopeRoot: scopeRoot(options.scope, options.agentsDir),
    targetId: (options.destination === "canonical" ? "claude" : options.target) as never,
    destination: options.destination,
    installRoot: options.installRoot,
    capabilityName: options.capability,
    diff: fileDiff,
  };
}

function bigFixture(): EmittedDiff[] {
  const diffs: EmittedDiff[] = [];
  const userAgents = "/home/u/.agents";
  const caps = ["deep-research", "design", "tdd"];
  for (let index = 0; index < 60; index += 1) {
    const cap = caps[index % 3] as string;
    diffs.push(
      diff({
        scope: "user",
        agentsDir: userAgents,
        target: "canonical",
        destination: "canonical",
        installRoot: userAgents,
        capability: cap,
        file: `skills/${cap}/file-${index}.md`,
      }),
      diff({
        scope: "user",
        agentsDir: userAgents,
        target: "claude",
        destination: "native",
        installRoot: "/home/u/.claude",
        capability: cap,
        file: `skills/${cap}/file-${index}.md`,
      }),
    );
  }
  for (let index = 0; index < 10; index += 1) {
    diffs.push(
      diff({
        scope: "user",
        agentsDir: userAgents,
        target: "claude",
        destination: "native",
        installRoot: "/home/u/.claude",
        capability: "design",
        file: `notices/${index}.md`,
        notice: true,
      }),
      diff({
        scope: "project",
        agentsDir: "/repo/.agents",
        target: "claude",
        destination: "native",
        installRoot: "/repo/.claude",
        capability: "alpha-cap",
        file: `skills/alpha/file-${index}.md`,
      }),
    );
  }
  return diffs;
}

test("a 140-diff plan renders in at most 25 lines by default", () => {
  const view = buildPlanView(bigFixture());
  const lines = renderPlan(view, { quiet: false });
  expect(view.fileCount).toBe(140);
  expect(lines.length).toBeLessThanOrEqual(25);
});

test("verbose expands every file and preserves totals", () => {
  const fixture = bigFixture();
  const collapsed = buildPlanView(fixture);
  const expanded = buildPlanView(fixture, { verbose: true });
  const lines = renderPlan(expanded, { quiet: false });
  expect(lines.join("\n")).toContain("file-42.md");
  expect(expanded.fileCount).toBe(collapsed.fileCount);
  const sum = (view: typeof collapsed) =>
    view.totals.reduce((total, item) => total + item.create + item.update + item.delete, 0);
  expect(sum(collapsed)).toBe(140);
  expect(sum(expanded)).toBe(140);
});

test("ordering is deterministic: user before project, canonical before targets", () => {
  const view = buildPlanView(bigFixture());
  expect(view.scopes.map((scope) => scope.scope)).toEqual(["user", "project"]);
  const userLabels = view.scopes[0]?.destinations.map((d) => d.label);
  expect(userLabels).toEqual(["canonical", "claude"]);
});

test("managed notices roll up into a single row per destination", () => {
  const view = buildPlanView(bigFixture());
  const claude = view.scopes[0]?.destinations.find((d) => d.label === "claude");
  const noticeRows = claude?.rows.filter((row) => row.notice) ?? [];
  expect(noticeRows).toHaveLength(1);
  expect(noticeRows[0]?.fileCount).toBe(10);
});

test("planToJson is fully expanded and machine stable", () => {
  const json = planToJson(buildPlanView(bigFixture())) as { changes: unknown[]; fileCount: number };
  expect(json.changes).toHaveLength(140);
  expect(json.fileCount).toBe(140);
});
