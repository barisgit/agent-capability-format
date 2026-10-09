import path from "node:path";
import { type AcfCapability, type Diagnostic, resolveScopeCapabilities } from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { readCwd, readScope } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { printJson, readJson } from "../internal/json.js";
import { exitCodeForDiagnostics, finishWithDiagnostics, reporter } from "../internal/output.js";
import { displayPath } from "../internal/plan-view.js";
import { columns, displayVersion } from "../internal/render.js";
import { resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";

export const listCommand = defineCommand({
  meta: { name: "list", description: "list installed capabilities (alias: ls)" },
  args: specToCittyArgs("list") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const diagnostics: Diagnostic[] = [];
      const inventories: Array<{ scope: string; path: string; capabilities: AcfCapability[] }> = [];
      for (const scopeRoot of await resolveScopeRoots(readScope(context.args), cwd)) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        inventories.push({
          scope: scopeRoot.scope,
          path: path.join(scopeRoot.agentsDir, "capabilities"),
          capabilities: resolved.capabilities,
        });
      }
      if (readJson(context.args)) {
        const code = exitCodeForDiagnostics(diagnostics, context.args);
        printJson("list", code === 0, diagnostics, {
          scopes: inventories.map((inventory) => ({
            scope: inventory.scope,
            path: inventory.path,
            capabilities: inventory.capabilities.map((capability) => ({
              name: capability.manifest.name,
              version: capability.manifest.version,
            })),
          })),
        });
        process.exitCode = code;
        return;
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code === 0) {
        const out = reporter(context.args);
        let count = 0;
        let first = true;
        const counts: string[] = [];
        for (const inventory of inventories) {
          if (!first) out.log("");
          first = false;
          out.log(`${colors.bold(inventory.scope)}  ${colors.dim(displayPath(inventory.path))}`);
          if (inventory.capabilities.length === 0) {
            out.log("  No capabilities installed.");
            out.hint(`Get started: caplet add <source> --scope ${inventory.scope}`);
            continue;
          }
          const head = ["NAME", "VERSION", "CONTENTS"].map((cell) => colors.dim(cell));
          const rows = inventory.capabilities.map((capability) => {
            const summary = describeCapability(capability);
            return [
              colors.bold(summary.name),
              displayVersion(summary.version),
              colors.dim(summary.contents),
            ];
          });
          for (const line of columns([head, ...rows], { indent: "  " })) out.log(line);
          count += inventory.capabilities.length;
          counts.push(`${inventory.capabilities.length} ${inventory.scope}`);
        }
        out.log("");
        out.done(
          `${count} ${count === 1 ? "capability" : "capabilities"}${counts.length > 1 ? ` (${counts.join(", ")})` : ""}`,
        );
      }
    });
  },
});

function describeCapability(capability: AcfCapability): {
  name: string;
  version: string;
  contents: string;
} {
  const contents = [
    ["skills", capability.skills.length],
    ["agents", capability.agents.length],
    ["commands", capability.commands.length],
    ["instructions", capability.instructions.length],
    ["hooks", Object.values(capability.hooks?.buckets ?? {}).flat().length],
    ["mcp", capability.mcp?.servers.length ?? 0],
  ]
    .filter((item) => item[1] !== 0)
    .map((item) => `${item[0]} ${item[1]}`)
    .join(", ");
  return { name: capability.manifest.name, version: capability.manifest.version, contents };
}
