import { afterEach, expect, test } from "bun:test";
import path from "node:path";
import { scopeRoot } from "@caplet/core";
import { planClaudeScope } from "../../src/hosts/claude/plan.js";
import { planClaudeMarketplaces } from "../../src/internal/claude-marketplace.js";
import { cleanup, makeScope, type TestScope, writeText } from "../helpers.js";

const scopes: TestScope[] = [];
afterEach(async () => {
  await Promise.all(scopes.splice(0).map(cleanup));
});

for (const state of ["loose", "empty", "held", "refused"] as const) {
  for (const otherPlugin of [false, true]) {
    test(`selected ${state} capability keeps its observed plugin after sidecar identity is lost (other plugin: ${otherPlugin})`, async () => {
      const scope = await makeScope();
      scopes.push(scope);
      const installRoot = path.join(scope.home, ".claude");
      const planned = await planClaudeMarketplaces({
        roots: [{ scopeRoot: scopeRoot("user", path.join(scope.home, ".agents")), installRoot }],
        plugins: otherPlugin
          ? [
              {
                target: "claude",
                scopeRoot: scopeRoot("user", path.join(scope.home, ".agents")),
                scope: "user",
                installRoot,
                dir: path.join(installRoot, ".acf", "marketplace", "plugins", "other"),
                name: "other",
                version: "1.0.0",
              },
            ]
          : [],
        blocked:
          state === "refused" ? [{ scope: "user", target: "claude", capability: "review" }] : [],
        held: state === "held" ? [{ scope: "user", capability: "review" }] : [],
        pluginless:
          state === "loose" || state === "empty"
            ? [{ scope: "user", capability: "review", output: state }]
            : [],
      });
      expect(planned.roots).toHaveLength(1);
      if (!otherPlugin) expect(planned.diffs).toEqual([]);
      const root = planned.roots[0];
      if (root === undefined)
        throw new Error("Selected capability must participate in reconciliation");
      const plan = planClaudeScope(root, {
        projectDir: scope.cwd,
        marketplaces: [{ name: "acf-user", source: "directory", path: root.marketplaceDir }],
        plugins: [
          {
            id: "review@acf-user",
            name: "review",
            marketplace: "acf-user",
            version: "1.0.0",
            scope: "user",
            enabled: true,
            installPath: path.join(scope.dir, "cache"),
          },
        ],
        settings: [],
      });
      // Neither a missing manifest nor missing ownership proves that the user deselected review.
      expect(plan.steps.some((step) => step.command.op === "uninstall")).toBe(false);
      expect(plan.steps.some((step) => step.command.op === "marketplace remove")).toBe(false);
      expect(plan.plugins.find((plugin) => plugin.name === "review")?.action).toBe("kept");
    });
  }
}

for (const state of ["held", "refused"] as const) {
  for (const installed of [false, true]) {
    test(`${state} plugin with a readable generated version is never installed or updated (installed: ${installed})`, async () => {
      const scope = await makeScope();
      scopes.push(scope);
      const installRoot = path.join(scope.home, ".claude");
      const marketplaceDir = path.join(installRoot, ".acf", "marketplace");
      await writeText(
        path.join(marketplaceDir, "plugins", "review", ".claude-plugin", "plugin.json"),
        '{"name":"review","version":"2.0.0"}',
      );
      const planned = await planClaudeMarketplaces({
        roots: [{ scopeRoot: scopeRoot("user", path.join(scope.home, ".agents")), installRoot }],
        plugins: [],
        blocked:
          state === "refused" ? [{ scope: "user", target: "claude", capability: "review" }] : [],
        held: state === "held" ? [{ scope: "user", capability: "review" }] : [],
      });
      const root = planned.roots[0];
      if (root === undefined) throw new Error("Held or refused plugin must keep its marketplace");
      const plan = planClaudeScope(root, {
        projectDir: scope.cwd,
        marketplaces: [{ name: "acf-user", source: "directory", path: marketplaceDir }],
        plugins: installed
          ? [
              {
                id: "review@acf-user",
                name: "review",
                marketplace: "acf-user",
                version: "1.0.0",
                scope: "user",
                enabled: true,
                installPath: path.join(scope.dir, "cache"),
              },
            ]
          : [],
        settings: [],
      });
      expect(plan.steps).toEqual([]);
    });
  }
}
