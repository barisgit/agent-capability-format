import { type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { defineCommand } from "citty";
import { colors } from "consola/utils";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printDiagnostics, reporter } from "../internal/output";
import { buildPlanView, displayPath } from "../internal/plan-view";
import { columns } from "../internal/render";
import { resolveScopeRoots } from "../internal/scopes";
import { buildEmitPlan } from "../internal/workflow";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "summarize scopes, capabilities, and pending changes" },
  args: globalArgs,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const out = reporter(context.args);
      const diagnostics: Diagnostic[] = [];
      const scopes = await resolveScopeRoots(readScope(context.args), cwd);
      const rows: string[][] = [];
      for (const scopeRoot of scopes) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        const names = resolved.capabilities.map((capability) => capability.manifest.name).sort();
        rows.push([
          colors.bold(scopeRoot.scope),
          colors.dim(displayPath(scopeRoot.agentsDir)),
          names.length === 0 ? colors.dim("none — caplet add <source>") : summarizeNames(names),
        ]);
      }
      for (const line of columns(rows, { indent: "  " })) out.log(line);
      out.log("");
      const plan = await buildEmitPlan(context.args);
      printDiagnostics([...diagnostics, ...plan.diagnostics], context.args);
      const view = buildPlanView(plan.diffs);
      if (view.fileCount === 0) {
        out.done("Everything up to date");
        return;
      }
      out.pending(`${view.fileCount} ${view.fileCount === 1 ? "change" : "changes"} pending`);
      out.hint("Preview: caplet apply -n \u00b7 apply: caplet apply");
    });
  },
});

function summarizeNames(names: readonly string[]): string {
  const shown = names.slice(0, 4);
  const more = names.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` +${more} more` : "");
}
