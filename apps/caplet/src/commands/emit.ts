import { defineCommand } from "citty";
import { globalArgs } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { applyEmitPlan, buildEmitPlan, summarizeDiffs } from "../internal/workflow";

export const emitCommand = defineCommand({
  meta: { name: "emit", description: "emit FileDiffs to native target artifacts" },
  args: {
    ...globalArgs,
    target: { type: "string", description: "target id to emit" },
    "dry-run": { type: "boolean", default: false, description: "show diffs without writing" },
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
      for (const line of summarizeDiffs(plan.diffs)) out.log(line);
      if (context.args["dry-run"] === true) {
        out.log(`${plan.diffs.length} pending diffs`);
        return;
      }
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log(`applied ${written} writes and ${deleted} deletes`);
    });
  },
});
