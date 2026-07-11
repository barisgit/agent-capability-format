import { type AcfCapability, type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { defineCommand } from "citty";
import { colors } from "consola/utils";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { exitCodeForDiagnostics, finishWithDiagnostics, reporter } from "../internal/output";
import { columns } from "../internal/render";
import { resolveScopeRoots } from "../internal/scopes";

export const listCommand = defineCommand({
  meta: { name: "list", description: "list installed capabilities (alias: ls)" },
  args: globalArgs,
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
          path: scopeRoot.agentsDir,
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
          out.log(`${colors.bold(inventory.scope)}  ${colors.dim(inventory.path)}`);
          if (inventory.capabilities.length === 0) {
            out.log("  No capabilities installed.");
            out.hint(`Get started: caplet add <source> --scope ${inventory.scope}`);
            continue;
          }
          const head = ["NAME", "VERSION", "FACETS"].map((cell) => colors.dim(cell));
          const rows = inventory.capabilities.map((capability) => {
            const summary = describeCapability(capability);
            return [colors.bold(summary.name), summary.version, colors.dim(summary.facets)];
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
  facets: string;
} {
  const facets = [
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
  return { name: capability.manifest.name, version: capability.manifest.version, facets };
}
