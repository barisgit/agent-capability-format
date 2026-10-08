/**
 * Negative fixtures for data-only restrictions (capability-model-layers, Negative fixtures for
 * data-only restrictions). Each fixture plans one source package under `tests/negative/` for its
 * targets through `caplet apply` and asserts that the plan reports the refusal with a recovery
 * and that nothing stands in for the refused restriction: the project holds exactly the
 * `written` files (so no component file, shared-root copy, wrapper or substitute artifact) and
 * no written file contains a forbidden text.
 *
 * A `negativeFixture` id in the field support registry names a fixture here; the last test runs
 * the registry self-check against these ids.
 */
import { expect, test } from "bun:test";
import path from "node:path";
import { checkSupportRegistry, type Diagnostic, fieldSupport, nativeKeys } from "@caplet/core";
import { cleanup, makeScope, readText, runCaplet, writeText } from "./helpers";

type NegativeFixture = {
  /** Stable id; registry cells name it in `negativeFixture`. */
  id: string;
  /** Source package directory under `tests/negative/`. */
  source: string;
  targets: string[];
  /** Refusals the plan reports: target and `data.source` (the field, key or component). */
  refused: { target: string; source: string; mentions?: string }[];
  /** Project files written besides caplet's own `.agents` state; none by default. */
  written?: string[];
  /** Text no written file may contain, beyond {@link substitutes}. */
  forbidden?: string[];
};

/** Substitutes the research proposed for restrictions a host cannot enforce. */
const substitutes = ["Use when working with files matching", "permissions", "deny"];

const userOnly = (target: string): NegativeFixture => ({
  id: `skill-user-only-${target}`,
  source: "acf-user-only",
  targets: [target],
  refused: [{ target, source: "skill.invocation.user=false" }],
  forbidden: ["user-invocable", "House conventions"],
});

const fixtures: NegativeFixture[] = [
  {
    id: "skill-manual-only-opencode",
    source: "claude-manual-only",
    targets: ["opencode"],
    refused: [{ target: "opencode", source: "skill.invocation.model=false" }],
    forbidden: ["disable-model-invocation", "Deploy the service"],
  },
  userOnly("codex"),
  userOnly("cursor"),
  userOnly("opencode"),
  userOnly("pi"),
  {
    id: "skill-paths-codex",
    source: "claude-paths",
    targets: ["codex"],
    refused: [{ target: "codex", source: "targets.claude.native.paths" }],
    forbidden: ["src/**", "House source conventions"],
  },
  {
    id: "skill-shared-root-manual-only-opencode-pi",
    source: "acf-manual-only",
    targets: ["opencode", "pi"],
    refused: [{ target: "opencode", source: "skill.invocation.model=false" }],
    // Pi honors manual-only natively, so it gets its own copy instead of the shared one.
    written: [
      ".pi/.acf-managed.json",
      ".pi/ACF-MANAGED.md",
      ".pi/skills/release/ACF-MANAGED.md",
      ".pi/skills/release/SKILL.md",
    ],
  },
  {
    id: "package-guard-hook-codex",
    source: "claude-guard-hook",
    targets: ["codex"],
    refused: [{ target: "codex", source: "hook hooks" }],
    forbidden: ["PreToolUse", "guard.js", "Run shell commands"],
  },
  {
    id: "mcp-agent-plugins-cwd-claude",
    source: "agent-plugins-cwd",
    targets: ["claude"],
    refused: [{ target: "claude", source: "mcp.cwd", mentions: "directory" }],
    forbidden: ["server.js"],
  },
];

/** caplet's own state under `.agents`, which every apply writes. */
const capletState = new Set([
  ".agents/capabilities.yml",
  ".agents/capabilities.lock",
  ".agents/caplet.yml",
]);

async function projectFiles(cwd: string): Promise<string[]> {
  const files = [...new Bun.Glob("**/*").scanSync({ cwd, dot: true })];
  return files
    .filter((file) => !file.startsWith(".agents/capabilities/") && !capletState.has(file))
    .sort();
}

for (const fixture of fixtures) {
  test(`negative fixture ${fixture.id}`, async () => {
    const scope = await makeScope();
    try {
      const source = path.join(import.meta.dir, "negative", fixture.source);
      await writeText(
        path.join(scope.agentsDir, "capabilities.yml"),
        `acf: 1\ncapabilities:\n  - source: path:${source}\n`,
      );
      await writeText(
        path.join(scope.agentsDir, "caplet.yml"),
        `emit:\n  defaultTargets: [${fixture.targets.join(", ")}]\n`,
      );

      const result = await runCaplet(scope, [
        "apply",
        "--cwd",
        scope.cwd,
        "--scope",
        "project",
        "--json",
      ]);

      expect(result.exitCode).toBe(2);
      const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };
      const refusals = diagnostics.filter((item) => item.code === "acf.support.refused");
      for (const expected of fixture.refused) {
        const refusal = refusals.find(
          (item) => item.targetId === expected.target && item.data?.source === expected.source,
        );
        if (refusal === undefined) {
          throw new Error(`no refusal by ${expected.source} for ${expected.target}`);
        }
        const recovery = refusal.data?.recovery;
        expect(typeof recovery === "string" && recovery.length > 0).toBe(true);
        expect(refusal.message).toContain(`Recovery: ${String(recovery)}`);
        if (expected.mentions !== undefined) expect(refusal.message).toContain(expected.mentions);
      }

      const written = await projectFiles(scope.cwd);
      expect(written).toEqual([...(fixture.written ?? [])].sort());
      for (const file of written) {
        const text = await readText(path.join(scope.cwd, file));
        for (const needle of [...substitutes, ...(fixture.forbidden ?? [])]) {
          expect({ file, contains: text.includes(needle) }).toEqual({ file, contains: false });
        }
      }
    } finally {
      await cleanup(scope);
    }
  });
}

test("every negativeFixture in the support registry names a fixture here", () => {
  const ids = new Set(fixtures.map((fixture) => fixture.id));
  expect(ids.size).toBe(fixtures.length);
  expect(checkSupportRegistry(fieldSupport, nativeKeys, { negativeFixtures: ids })).toEqual([]);
});
