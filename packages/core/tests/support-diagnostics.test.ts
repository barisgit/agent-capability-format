import { describe, expect, test } from "bun:test";
import {
  componentOmitted,
  corePending,
  extraDropped,
  nativeTreeDropped,
  packageRefused,
  readSupportData,
  supportCell,
  supportDiagnostic,
  translatedOutcome,
} from "../src/index.js";

const review = { capability: "tools", family: "skill", component: "review" } as const;

describe("support diagnostics derived from registry cells", () => {
  test("a refused cell blocks the component with field, consequence and recovery", () => {
    const diagnostic = supportDiagnostic(
      { ...review, target: "opencode" },
      "skill.invocation.model=false",
    );
    const cell = supportCell("skill.invocation.model=false", "opencode", "loose");
    if (cell?.kind !== "refused") throw new Error("expected the OpenCode cell to refuse");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.code).toBe("acf.support.refused");
    expect(diagnostic?.targetId).toBe("opencode");
    expect(diagnostic?.family).toBe("skill");
    expect(diagnostic?.capability).toEqual({ name: "tools" });
    expect(diagnostic?.message).toContain("skill.invocation.model=false");
    expect(diagnostic?.message).toContain(cell.reason);
    expect(diagnostic?.message).toContain("exclude: { skill: [review] } or except: [opencode]");
    expect(readSupportData(diagnostic)).toEqual({
      family: "skill",
      component: "review",
      outcome: "blocked",
      blocks: "component",
      source: "skill.invocation.model=false",
      consequence: "skill review is not installed for opencode",
      recovery: "exclude: { skill: [review] } or except: [opencode]",
    });
  });

  test("an MCP server is named in its proper form, not by its family id", () => {
    const diagnostic = supportDiagnostic(
      { capability: "tools", family: "mcp", component: "events", target: "codex" },
      "mcp.transport=sse",
    );
    expect(diagnostic?.message).toStartWith("MCP server events is blocked for codex");
    expect(readSupportData(diagnostic)?.consequence).toBe(
      "MCP server events is not installed for codex",
    );
  });

  test("a degraded cell supplies code, severity and message (Codex argument-hint)", () => {
    const diagnostic = supportDiagnostic({ ...review, target: "codex" }, "skill.argument-hint");
    const cell = supportCell("skill.argument-hint", "codex", "loose");
    if (cell?.kind !== "degraded") throw new Error("expected the Codex cell to degrade");
    expect(diagnostic?.code).toBe("acf.support.degraded");
    expect(diagnostic?.severity).toBe(cell.severity);
    expect(diagnostic?.message).toContain(cell.loss);
    expect(readSupportData(diagnostic)?.dropped).toBe("skill.argument-hint");
    expect(readSupportData(diagnostic)?.outcome).toBeUndefined();
  });

  test("native and translated cells produce no diagnostic", () => {
    expect(
      supportDiagnostic({ ...review, target: "claude" }, "skill.argument-hint"),
    ).toBeUndefined();
    const server = { capability: "tools", family: "mcp", component: "docs" } as const;
    expect(
      supportDiagnostic({ ...server, target: "opencode" }, "mcp.transport=stdio"),
    ).toBeUndefined();
  });

  test("a translated cell yields a translated outcome carrying the rule", () => {
    const server = { capability: "tools", family: "mcp", component: "docs" } as const;
    const outcome = translatedOutcome({ ...server, target: "opencode" }, "mcp.transport=stdio");
    const cell = supportCell("mcp.transport=stdio", "opencode", "loose");
    if (cell?.kind !== "translated") throw new Error("expected the OpenCode cell to translate");
    expect(outcome).toEqual({
      capability: "tools",
      target: "opencode",
      family: "mcp",
      component: "docs",
      outcome: "translated",
      source: "mcp.transport=stdio",
      consequence: cell.rule,
    });
    expect(
      translatedOutcome({ ...server, target: "claude" }, "mcp.transport=stdio"),
    ).toBeUndefined();
  });

  test("the default carrier is used when the subject names none", () => {
    const server = { capability: "tools", family: "mcp", component: "docs" } as const;
    expect(supportDiagnostic({ ...server, target: "claude" }, "mcp.cwd")?.code).toBe(
      "acf.support.refused",
    );
    expect(
      supportDiagnostic({ ...server, target: "claude", carrier: "loose" }, "mcp.cwd")?.code,
    ).toBe("acf.support.refused");
  });

  test("component omission is lossy and names the recovery", () => {
    const diagnostic = componentOmitted(
      { capability: "tools", family: "agent", component: "helper", target: "codex" },
      "Codex loose files have no agent carrier",
    );
    expect(diagnostic.severity).toBe("lossy");
    expect(diagnostic.code).toBe("acf.support.component-omitted");
    expect(diagnostic.message).toContain("Codex loose files have no agent carrier");
    expect(readSupportData(diagnostic)).toMatchObject({
      outcome: "omitted",
      source: "agent",
      recovery: "exclude: { agent: [helper] } or except: [codex]",
    });
  });

  test("a restricting component without a carrier refuses the whole package", () => {
    const diagnostic = packageRefused(
      { capability: "tools", family: "hook", component: "guard", target: "codex" },
      "its PreToolUse hook can block tool calls and Codex has no equivalent",
    );
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.code).toBe("acf.support.refused");
    expect(diagnostic.message).toContain("hook guard");
    expect(readSupportData(diagnostic)).toMatchObject({ outcome: "blocked", blocks: "package" });
  });

  test("unclassified extras are dropped with a lossy diagnostic", () => {
    const diagnostic = extraDropped(
      { ...review, target: "codex" },
      { owner: "claude", key: "x-unknown" },
    );
    expect(diagnostic.severity).toBe("lossy");
    expect(diagnostic.code).toBe("acf.extras.dropped");
    expect(diagnostic.message).toContain("unclassified");
    expect(readSupportData(diagnostic)?.dropped).toBe("targets.claude.native.x-unknown");
  });

  test("a restricting extra the target cannot carry refuses the component", () => {
    const diagnostic = extraDropped(
      { ...review, target: "codex" },
      { owner: "claude", key: "paths" },
    );
    expect(diagnostic.code).toBe("acf.support.refused");
    expect(readSupportData(diagnostic)).toMatchObject({
      outcome: "blocked",
      source: "targets.claude.native.paths",
    });
  });

  test("a restricting extra whose core equivalent the target carries is only dropped", () => {
    const diagnostic = extraDropped(
      { ...review, target: "pi" },
      { owner: "claude", key: "disable-model-invocation" },
    );
    expect(diagnostic.code).toBe("acf.extras.dropped");
  });

  test("a dropped native file tree is reported against the package", () => {
    const diagnostic = nativeTreeDropped({ capability: "tools", target: "codex" }, "claude");
    expect(diagnostic.code).toBe("acf.extras.dropped");
    expect(diagnostic.severity).toBe("lossy");
    expect(readSupportData(diagnostic)).toMatchObject({
      family: "package",
      component: "tools",
      dropped: "native/claude/",
    });
  });

  test("pending native keys name the future core field", () => {
    const diagnostic = corePending({ ...review, target: "claude" }, "allowed-tools");
    expect(diagnostic?.severity).toBe("info");
    expect(diagnostic?.code).toBe("acf.core.pending");
    expect(diagnostic?.message).toContain("skill.allowed-tools");
    expect(corePending({ ...review, target: "claude" }, "description")).toBeUndefined();
  });
});
