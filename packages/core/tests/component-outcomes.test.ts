import { describe, expect, test } from "bun:test";
import {
  type AcfCapability,
  type ComponentOutcome,
  componentOmitted,
  componentOutcomes,
  type Diagnostic,
  packageRefused,
  supportDiagnostic,
} from "../src/index.js";

function capability(): AcfCapability {
  const prose = (name: string) => ({
    name,
    path: `${name}.md`,
    frontmatter: { name, description: name },
    body: "",
  });
  return {
    root: "/caps/tools",
    scope: "project",
    origin: { kind: "local" },
    manifest: { acf: 1, name: "tools", version: "1.0.0" },
    skills: [prose("review")],
    agents: [prose("helper")],
    commands: [],
    instructions: [prose("always")],
    hooks: {
      path: "hooks/hooks.yml",
      buckets: {
        before_tool: [{ name: "guard", run: { command: "guard" }, effect: "block" }],
      },
    },
    mcp: {
      path: "mcp/mcp.yml",
      servers: [{ name: "docs", transport: "stdio", command: "docs" }],
    },
    assets: [],
    diagnostics: [],
  } as unknown as AcfCapability;
}

function byComponent(outcomes: readonly ComponentOutcome[]): Record<string, string> {
  return Object.fromEntries(
    outcomes.map((item) => [`${item.family}:${item.component}`, item.outcome]),
  );
}

describe("component outcomes", () => {
  test("every component is native when nothing reports otherwise", () => {
    const outcomes = componentOutcomes({
      capability: capability(),
      target: "claude",
      diagnostics: [],
    });
    expect(byComponent(outcomes)).toEqual({
      "skill:review": "native",
      "agent:helper": "native",
      "instruction:always": "native",
      "hook:guard": "native",
      "mcp:docs": "native",
    });
    expect(outcomes.every((item) => item.capability === "tools" && item.target === "claude")).toBe(
      true,
    );
  });

  test("support diagnostics and reported translations set the outcome", () => {
    const subject = { capability: "tools", family: "skill", component: "review" } as const;
    const diagnostics = [
      supportDiagnostic({ ...subject, target: "opencode" }, "skill.invocation.model=false"),
      supportDiagnostic({ ...subject, target: "opencode" }, "skill.argument-hint"),
      componentOmitted(
        { capability: "tools", family: "agent", component: "helper", target: "opencode" },
        "no agent carrier",
      ),
    ].filter((item): item is Diagnostic => item !== undefined);
    const outcomes = componentOutcomes({
      capability: capability(),
      target: "opencode",
      diagnostics,
      reported: [
        {
          capability: "tools",
          target: "opencode",
          family: "mcp",
          component: "docs",
          outcome: "translated",
          source: "mcp.transport=stdio",
          consequence: "type: local with a command array",
        },
      ],
    });
    expect(byComponent(outcomes)).toMatchObject({
      "skill:review": "blocked",
      "agent:helper": "omitted",
      "mcp:docs": "translated",
      "instruction:always": "native",
    });
    const review = outcomes.find((item) => item.component === "review");
    expect(review?.source).toBe("skill.invocation.model=false");
    expect(review?.recovery).toBe("exclude: { skill: [review] } or except: [opencode]");
    expect(review?.dropped).toEqual(["skill.argument-hint"]);
  });

  test("a package refusal blocks every component", () => {
    const outcomes = componentOutcomes({
      capability: capability(),
      target: "codex",
      diagnostics: [
        packageRefused(
          { capability: "tools", family: "hook", component: "guard", target: "codex" },
          "its blocking hook has no Codex equivalent",
        ),
      ],
    });
    expect(new Set(outcomes.map((item) => item.outcome))).toEqual(new Set(["blocked"]));
    expect(outcomes.find((item) => item.component === "docs")?.source).toBe("hook guard");
  });

  test("legacy adapter diagnostics map to omitted and changed behavior", () => {
    const legacy: Diagnostic[] = [
      {
        severity: "lossy",
        code: "acf.adapter.facet-unsupported",
        message: "cursor does not natively support agent; facet is not emitted",
        targetId: "cursor",
        family: "agent",
      },
      {
        severity: "lossy",
        code: "acf.adapter.trigger-unsupported",
        message: "cursor only emits file_context instructions as Cursor rules",
        targetId: "cursor",
        family: "instruction",
        data: { instruction: "always", activation: "always" },
      },
      {
        severity: "lossy",
        code: "acf.adapter.effect-degraded",
        message: "cursor only partially supports hook effects; block emitted as observe",
        targetId: "cursor",
        family: "hook",
        data: { hook: "guard", hookType: "before_tool", effect: "block" },
      },
      {
        severity: "lossy",
        code: "acf.adapter.facet-unsupported",
        message: "codex does not support skill",
        targetId: "codex",
        family: "skill",
      },
    ];
    const outcomes = componentOutcomes({
      capability: capability(),
      target: "cursor",
      diagnostics: legacy,
    });
    expect(byComponent(outcomes)).toEqual({
      "skill:review": "native",
      "agent:helper": "omitted",
      "instruction:always": "omitted",
      "hook:guard": "changed-behavior",
      "mcp:docs": "native",
    });
    const helper = outcomes.find((item) => item.component === "helper");
    expect(helper?.consequence).toBe(
      "cursor does not natively support agent; facet is not emitted",
    );
    expect(helper?.recovery).toBe("exclude: { agent: [helper] } or except: [cursor]");
  });

  test("a partially supported family is changed behavior, an unsupported hook event omits its hooks", () => {
    const outcomes = componentOutcomes({
      capability: capability(),
      target: "codex",
      diagnostics: [
        {
          severity: "lossy",
          code: "acf.adapter.facet-unsupported",
          message: "codex only partially supports instruction facets; emitted a degraded artifact",
          targetId: "codex",
          family: "instruction",
          data: { outcome: "changed-behavior" },
        },
        {
          severity: "lossy",
          code: "acf.adapter.hook-event-unsupported",
          message: "codex does not support hook event before_tool",
          targetId: "codex",
          family: "hook",
          data: { hookType: "before_tool" },
        },
      ],
    });
    expect(byComponent(outcomes)).toMatchObject({
      "instruction:always": "changed-behavior",
      "hook:guard": "omitted",
    });
  });
});
