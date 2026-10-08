import { expect, test } from "bun:test";
import {
  checkSupportRegistry,
  type FieldSupport,
  fieldSupport,
  type NativeKeyInfo,
  nativeKeyInfo,
  nativeKeys,
  supportCell,
  targetCarriers,
  targetIds,
  targetMap,
} from "../src";

const evidence = { level: "documented", source: "test" } as const;
const DOLLAR = "$";
const CAP = `${DOLLAR}{ACF_CAPABILITY_DIR}`;
const DATA = `${DOLLAR}{ACF_DATA_DIR}`;

const SKILL_FIELDS = [
  "skill.name",
  "skill.description",
  "skill.license",
  "skill.compatibility",
  "skill.metadata",
  "skill.invocation.model=false",
  "skill.invocation.user=false",
  "skill.argument-hint",
  "skill.files",
  "skill.files.executable",
];
const MCP_FIELDS = [
  "mcp.transport=stdio",
  "mcp.transport=http",
  "mcp.transport=sse",
  "mcp.command=bare",
  `mcp.command=${CAP}`,
  "mcp.command=absolute",
  "mcp.args",
  "mcp.env",
  "mcp.cwd",
  "mcp.url",
  "mcp.headers",
  `mcp.args=${CAP}`,
  `mcp.env=${CAP}`,
  `mcp.cwd=${CAP}`,
  `mcp.url=${CAP}`,
  `mcp.headers=${CAP}`,
  `mcp.args=${DATA}`,
  `mcp.env=${DATA}`,
  `mcp.cwd=${DATA}`,
];
const PACKAGE_FIELDS = [
  "package.name",
  "package.version",
  "package.description",
  "package.authors",
  "package.authors.additional",
  "package.license",
  "package.homepage",
  "package.repository",
  "package.keywords",
];

test("fieldSupport declares one entry per skill, MCP and package field or value condition", () => {
  expect(fieldSupport.map((entry) => entry.field)).toEqual([
    ...SKILL_FIELDS,
    ...MCP_FIELDS,
    ...PACKAGE_FIELDS,
  ]);
});

test("claude offers the plugin and loose carriers with plugin as default; other targets are loose", () => {
  expect(targetCarriers.claude).toEqual({ available: ["plugin", "loose"], default: "plugin" });
  for (const target of targetIds.filter((id) => id !== "claude")) {
    expect(targetCarriers[target]).toEqual({ available: ["loose"], default: "loose" });
  }
});

test("supportCell answers per field, target and carrier", () => {
  expect(supportCell("skill.invocation.model=false", "codex", "loose")).toMatchObject({
    kind: "native",
    spelling: "policy.allow_implicit_invocation: false",
    location: "agents/openai.yaml",
  });
  expect(supportCell("skill.invocation.model=false", "opencode", "loose")).toMatchObject({
    kind: "refused",
    negativeFixture: "skill-manual-only-opencode",
  });
  expect(supportCell(`mcp.command=${CAP}`, "claude", "plugin")).toMatchObject({
    kind: "translated",
    rule: expect.stringContaining(`${DOLLAR}{CLAUDE_PLUGIN_ROOT}`),
  });
  expect(supportCell(`mcp.command=${CAP}`, "claude", "loose")).toMatchObject({
    kind: "translated",
    rule: expect.stringContaining("absolute"),
  });
  expect(supportCell("skill.argument-hint", "pi", "loose")).toMatchObject({
    kind: "degraded",
    severity: "lossy",
  });
  expect(supportCell("package.authors.additional", "claude", "plugin")).toMatchObject({
    kind: "degraded",
    severity: "lossy",
  });
});

test("Claude MCP cwd is refused on verified evidence that Claude ignores it", () => {
  for (const carrier of ["plugin", "loose"] as const) {
    const cell = supportCell("mcp.cwd", "claude", carrier);
    expect(cell?.kind).toBe("refused");
    if (cell?.kind !== "refused") continue;
    expect(cell.reason).toContain("ignores a server cwd key");
    expect(cell.evidence).toEqual({
      level: "verified",
      source:
        "research/plugin-interop/tools/claude-code.md#Runtime verification (claude 2.1.97, 2026-10-08)",
      hostVersion: "claude 2.1.97",
    });
  }
  expect(supportCell("mcp.cwd", "codex", "loose")?.kind).toBe("native");
});

test("package metadata has a destination only in the Claude plugin manifest", () => {
  expect(supportCell("package.name", "claude", "plugin")).toMatchObject({ kind: "native" });
  expect(supportCell("package.name", "claude", "loose")).toBeUndefined();
  expect(supportCell("package.name", "codex", "loose")).toBeUndefined();
});

test("supportCell rejects unknown fields and carriers a target does not offer", () => {
  expect(() => supportCell("skill.nope", "claude", "plugin")).toThrow("unknown support field");
  expect(() => supportCell("skill.name", "codex", "plugin")).toThrow("codex has no plugin carrier");
});

test("nativeKeyInfo classifies native keys with their core source or pending core field", () => {
  expect(nativeKeyInfo("claude", "skill", "user-invocable")).toMatchObject({
    class: "restricting",
    generatedFrom: "skill.invocation.user=false",
  });
  expect(nativeKeyInfo("claude", "skill", "paths")).toMatchObject({
    class: "restricting",
    pending: { coreField: "skill.paths" },
  });
  expect(nativeKeyInfo("codex", "mcp", "enabled_tools")).toMatchObject({
    class: "restricting",
    pending: { coreField: "mcp.tools.enabled" },
  });
  expect(nativeKeyInfo("claude", "package", "dependencies")).toMatchObject({
    pending: { coreField: "package.dependencies" },
  });
  expect(nativeKeyInfo("claude", "skill", "no-such-key")).toBeUndefined();
  expect(nativeKeys.filter((key) => key.target === "opencode" && key.family === "package")).toEqual(
    [],
  );
});

test("the shipped registry passes its self-check", () => {
  expect(checkSupportRegistry(fieldSupport, nativeKeys)).toEqual([]);
});

test("targets no longer declare family-level skill or MCP support", () => {
  for (const target of targetIds) {
    const support: Record<string, unknown> = targetMap[target]?.support ?? {};
    expect(support.skill).toBeUndefined();
    expect(support.mcp).toBeUndefined();
  }
});

function withCell(base: FieldSupport, cell: FieldSupport["cells"]): FieldSupport[] {
  return [{ ...base, cells: cell }];
}

test("self-check fails when a restricting or functional cell is degraded", () => {
  const degraded = { kind: "degraded", loss: "x", severity: "lossy", evidence } as const;
  for (const cls of ["restricting", "functional"] as const) {
    const problems = checkSupportRegistry(
      withCell(
        { family: "skill", field: "skill.x", class: cls, cells: {} },
        {
          pi: { loose: degraded },
        },
      ),
      [],
      { requireComplete: false },
    );
    expect(problems).toEqual([
      `skill.x (${cls}) on pi/loose is degraded; ${cls} fields are native, translated or refused`,
    ]);
  }
});

test("self-check fails when a refusing restricting cell lacks a negative fixture", () => {
  const problems = checkSupportRegistry(
    withCell(
      { family: "skill", field: "skill.x", class: "restricting", cells: {} },
      {
        pi: { loose: { kind: "refused", reason: "no switch" } },
      },
    ),
    [],
    { requireComplete: false },
  );
  expect(problems).toEqual([
    "skill.x (restricting) on pi/loose is refused without a negativeFixture",
  ]);
});

test("self-check fails when a skill or MCP field lacks a cell for an offered carrier", () => {
  const problems = checkSupportRegistry(
    withCell({ family: "mcp", field: "mcp.x", class: "functional", cells: {} }, {}),
    [],
  );
  expect(problems).toContain("mcp.x has no cell for claude/plugin");
  expect(problems).toContain("mcp.x has no cell for pi/loose");
});

test("self-check fails on unclassified keys and dangling generatedFrom or pending targets", () => {
  const fields: FieldSupport[] = [
    {
      family: "skill",
      field: "skill.name",
      class: "functional",
      cells: { pi: { loose: { kind: "native", spelling: "name", evidence } } },
    },
  ];
  const keys = [
    {
      target: "pi",
      family: "skill",
      key: "name",
      class: "functional",
      generatedFrom: "skill.name",
    },
    { target: "pi", family: "skill", key: "mystery", class: "weird" },
    {
      target: "pi",
      family: "skill",
      key: "ghost",
      class: "functional",
      generatedFrom: "skill.ghost",
    },
    {
      target: "cursor",
      family: "skill",
      key: "name",
      class: "functional",
      generatedFrom: "skill.name",
    },
    {
      target: "pi",
      family: "skill",
      key: "later",
      class: "functional",
      pending: { coreField: "skill.someday" },
    },
    { target: "pi", family: "skill", key: "name", class: "functional" },
  ] as unknown as NativeKeyInfo[];
  expect(checkSupportRegistry(fields, keys, { requireComplete: false })).toEqual([
    "pi skill key mystery has no safety class",
    "pi skill key ghost is generatedFrom unknown field skill.ghost",
    "cursor skill key name is generatedFrom skill.name, which has no non-refused cell for cursor",
    "pi skill key later is pending unknown core field skill.someday",
    "pi skill key name is listed twice",
  ]);
});

// Task 4.5 adds the negative fixtures. It replaces this todo with an assertion that every
// `negativeFixture` id in `fieldSupport` names an existing fixture directory.
test.todo("every negativeFixture id names an existing negative fixture", () => {});
