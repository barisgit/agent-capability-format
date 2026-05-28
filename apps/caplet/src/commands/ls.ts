import { defineCommand } from "citty";
import { resolveScopeCapabilities, type AcfCapability, type Diagnostic } from "@acf/core";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots, scopeLabel } from "../internal/scopes";

export const lsCommand = defineCommand({
  meta: { name: "ls", description: "list known capabilities per scope" },
  args: globalArgs,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const diagnostics: Diagnostic[] = [];
      const lines: string[] = [];
      for (const scopeRoot of await resolveScopeRoots(readScope(context.args), cwd)) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        lines.push(scopeLabel(scopeRoot));
        if (resolved.capabilities.length === 0) lines.push("  no capabilities");
        for (const capability of resolved.capabilities) lines.push(`  ${describeCapability(capability)}`);
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code === 0) {
        const out = reporter(context.args);
        for (const line of lines) out.log(line);
      }
    });
  },
});

function describeCapability(capability: AcfCapability): string {
  const facets = [
    ["skills", capability.skills.length],
    ["agents", capability.agents.length],
    ["commands", capability.commands.length],
    ["instructions", capability.instructions.length],
    ["hooks", Object.values(capability.hooks?.buckets ?? {}).flat().length],
    ["mcp", capability.mcp?.servers.length ?? 0],
  ]
    .filter((item) => item[1] !== 0)
    .map((item) => `${item[0]}=${item[1]}`)
    .join(" ");
  return `${capability.manifest.name}@${capability.manifest.version}${facets.length > 0 ? ` ${facets}` : ""}`;
}
