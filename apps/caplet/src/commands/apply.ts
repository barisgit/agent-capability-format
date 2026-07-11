import { defineCommand } from "citty";
import { globalArgs, readFetchMode, readQuiet, readVerbose } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
import { applyEmitPlan, buildEmitPlan, fetchScopes } from "../internal/workflow";

export const applyCommand = defineCommand({
  meta: { name: "apply", description: "fetch, emit, write sidecar, and apply diffs" },
  args: {
    ...globalArgs,
    target: { type: "string", description: "target id to apply" },
    mode: { type: "string", default: "auto", description: "fetch mode: auto, never, or force" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const fetched = await fetchScopes(context.args, readFetchMode(context.args));
      const plan = await buildEmitPlan(context.args);
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      printDiagnostics(diagnostics, context.args);
      const code = exitCodeForDiagnostics(diagnostics, context.args);
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
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
      if (!readVerbose(context.args) && !readQuiet(context.args)) {
        out.log("  " + "Full list: --verbose");
      }
    });
  },
});
