import { expect, test } from "bun:test";
import {
  type AcfCapability,
  componentOutcomes,
  type NativeRemainderComponent,
  readClaudePluginPackage,
} from "@caplet/core";
import { codexAdapter, piAdapter } from "../src";
import { CAP_ROOT, capabilityModel, emitModel, PROJECT, skillFacet, withCode } from "./util/model";
import { withTempPackage } from "./util/temp-package";

/** A Claude plugin with one skill and the given remainder, as the Claude plugin reader builds it. */
function claudePlugin(remainder: NativeRemainderComponent[]): AcfCapability {
  const capability = capabilityModel({
    skills: [skillFacet({ name: "plain", description: "Plain skill" })],
    source: { format: "claude-plugin", path: ".", snapshotRoot: CAP_ROOT },
  });
  capability.remainder = remainder;
  return capability;
}

const guardHook: NativeRemainderComponent = {
  format: "claude-plugin",
  kind: "hook",
  name: "hooks",
  paths: ["hooks/hooks.json"],
  class: "restricting",
  executable: true,
};

const reviewerAgent: NativeRemainderComponent = {
  format: "claude-plugin",
  kind: "agent",
  name: "reviewer",
  paths: ["agents/reviewer.md"],
  class: "functional",
  executable: false,
};

test("a restricting Claude plugin hook refuses the whole package for a loose target", async () => {
  const result = await emitModel(codexAdapter, claudePlugin([guardHook]), `${PROJECT}/.codex`);
  const [refusal] = withCode(result, "acf.support.refused");
  expect(refusal?.targetId).toBe("codex");
  expect(refusal?.message).toContain("hook hooks");
  expect(refusal?.data).toMatchObject({ family: "hook", component: "hooks", blocks: "package" });
});

test("a functional Claude plugin agent is omitted for a loose target", async () => {
  const result = await emitModel(codexAdapter, claudePlugin([reviewerAgent]), `${PROJECT}/.codex`);
  expect(withCode(result, "acf.support.refused")).toEqual([]);
  const [omitted] = withCode(result, "acf.support.component-omitted");
  expect(omitted?.severity).toBe("lossy");
  expect(omitted?.data).toMatchObject({ family: "agent", component: "reviewer" });
  expect(result.diffs.some((diff) => diff.path.endsWith("plain/SKILL.md"))).toBe(true);
});

test("Claude plugin output styles and LSP servers are reported omitted for a loose target", async () => {
  const files: Record<string, string> = {
    ".claude-plugin/plugin.json": JSON.stringify({ name: "styled", version: "1.0.0" }),
    "skills/plain/SKILL.md": "---\nname: plain\ndescription: Plain skill\n---\nPlain.\n",
    "output-styles/concise.md": "---\nname: Concise\n---\nBe brief.\n",
    ".lsp.json": JSON.stringify({ go: { command: "gopls" } }),
  };
  await withTempPackage("remainder-", files, async (root) => {
    const read = await readClaudePluginPackage(root, {
      scope: "project",
      origin: { kind: "local", directory: root },
      revision: null,
    });
    if (read.capability === undefined) throw new Error("plugin did not load");

    const result = await emitModel(codexAdapter, read.capability, `${PROJECT}/.codex`);

    expect(withCode(result, "acf.support.refused")).toEqual([]);
    const omitted = withCode(result, "acf.support.component-omitted");
    expect(omitted.map((diagnostic) => [diagnostic.severity, diagnostic.data?.component])).toEqual([
      ["lossy", "concise"],
      ["lossy", "lsp-servers"],
    ]);
    const outcomes = componentOutcomes({
      capability: read.capability,
      target: "codex",
      diagnostics: result.diagnostics,
    }).filter((outcome) => outcome.family === "remainder");
    expect(outcomes).toEqual([
      expect.objectContaining({
        component: "concise",
        outcome: "omitted",
        source: "Claude plugin output-style",
        recovery: "except: [codex]",
      }),
      expect.objectContaining({
        component: "lsp-servers",
        outcome: "omitted",
        source: "Claude plugin lsp-server",
        recovery: "except: [codex]",
      }),
    ]);
  });
});

test("no shared skill copy is written when another reader refuses the package", async () => {
  const result = await emitModel(piAdapter, claudePlugin([guardHook]), `${PROJECT}/.pi`, {
    canonicalSkillReaders: ["codex", "pi"],
  });
  const written = result.diffs.map((diff) => diff.path);
  expect(written.some((file) => file.includes(".agents/skills/"))).toBe(false);
  expect(written.some((file) => file.endsWith(".pi/skills/plain/SKILL.md"))).toBe(true);
});
