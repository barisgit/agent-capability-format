import { defineCommand } from "citty";
import { resolveScopeCapabilities, type AcfCapability, type Diagnostic } from "@acf/core";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";

export const lsCommand = defineCommand({
  meta: { name: "ls", description: "list known capabilities per scope" },
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
        inventories.push({ scope: scopeRoot.scope, path: scopeRoot.agentsDir, capabilities: resolved.capabilities });
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code === 0) {
        const out = reporter(context.args);
        out.heading("ls");
        let count = 0;
        for (const inventory of inventories) {
          out.group(capitalize(inventory.scope), inventory.path);
          if (inventory.capabilities.length === 0) {
            out.empty("No capabilities found.", `Add one with caplet add <source> --scope ${inventory.scope}`);
          }
          for (const capability of inventory.capabilities) {
            const summary = describeCapability(capability);
            out.item(summary.name, `${summary.version}  ${summary.facets}`.trim());
            count += 1;
          }
        }
        out.log("");
        out.done(`${count} ${count === 1 ? "capability" : "capabilities"}`);
      }
    });
  },
});

function describeCapability(capability: AcfCapability): { name: string; version: string; facets: string } {
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
