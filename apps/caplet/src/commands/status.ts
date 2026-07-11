import { type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { defineCommand } from "citty";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printDiagnostics, reporter } from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
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
      const rows: Array<[string, string]> = [];
      for (const scopeRoot of scopes) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        const count = resolved.capabilities.length;
        rows.push([scopeRoot.scope, `${count} ${count === 1 ? "capability" : "capabilities"}`]);
      }
      out.details(rows);
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
