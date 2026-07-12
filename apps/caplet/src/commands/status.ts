import { type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { printDiagnostics, reporter } from "../internal/output";
import { buildPlanView, displayPath, reachLines, reachToJson } from "../internal/plan-view";
import { columns } from "../internal/render";
import { resolveScopeRoots } from "../internal/scopes";
import { specToCittyArgs } from "../internal/spec";
import { buildEmitPlan, collectReach } from "../internal/workflow";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "summarize scopes, capabilities, and pending changes" },
  args: specToCittyArgs("status") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const json = readJson(context.args);
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
      if (!json) {
        for (const line of columns(rows, { indent: "  " })) out.log(line);
        out.log("");
      }
      const plan = await buildEmitPlan(context.args);
      const reach = await collectReach(plan);
      if (!json) printDiagnostics([...diagnostics, ...plan.diagnostics], context.args);
      const view = buildPlanView(plan.diffs);
      if (json) {
        printJson("status", true, [...diagnostics, ...plan.diagnostics], {
          pending: view.fileCount,
          ...reachToJson(reach),
        });
        return;
      }
      out.details(reachLines(reach));
      out.log("");
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
