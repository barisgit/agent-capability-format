import { defineCommand } from "citty";
import { globalArgs, readVerbose } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
import { buildEmitPlan } from "../internal/workflow";

export const diffCommand = defineCommand({
  meta: { name: "diff", description: "show pending changes without applying" },
  args: {
    ...globalArgs,
    target: { type: "string", description: "target id" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const plan = await buildEmitPlan(context.args);
      printDiagnostics(plan.diagnostics, context.args);
      const code = exitCodeForDiagnostics(plan.diagnostics, context.args);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
      const out = reporter(context.args);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      if (view.fileCount === 0) {
        out.done("Output is up to date");
      } else {
        out.plan(view);
        out.pending(`${view.fileCount} ${view.fileCount === 1 ? "file" : "files"}`);
      }
      process.exitCode = code;
    });
  },
});
