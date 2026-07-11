import { defineCommand } from "citty";
import { globalArgs, readVerbose } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
import { applyEmitPlan, buildEmitPlan } from "../internal/workflow";

export const emitCommand = defineCommand({
  meta: { name: "emit", description: "write target artifacts without fetching" },
  args: {
    ...globalArgs,
    target: { type: "string", description: "target id to emit" },
    "dry-run": { type: "boolean", default: false, description: "show changes without writing" },
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
        return;
      }
      out.plan(view);
      if (context.args["dry-run"] === true) {
        out.pending(`${view.fileCount} ${view.fileCount === 1 ? "file" : "files"}`);
        return;
      }
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
    });
  },
});
