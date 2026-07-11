import { defineCommand } from "citty";
import { globalArgs } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import {
  exitCodeForDiagnostics,
  printChanges,
  printDiagnostics,
  reporter,
} from "../internal/output";
import {
  applyEmitPlan,
  buildEmitPlan,
  countPresentedFiles,
  describeDiffs,
} from "../internal/workflow";

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
      const changes = describeDiffs(plan.diffs);
      const fileCount = countPresentedFiles(changes);
      out.heading("emit");
      printChanges(out, changes);
      if (context.args["dry-run"] === true) {
        if (changes.length === 0) {
          out.log("");
          out.done("Output is up to date");
        } else {
          out.pending(`${fileCount} ${fileCount === 1 ? "file" : "files"}`);
        }
        return;
      }
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(
        fileCount === 0
          ? "Output is up to date"
          : `Applied ${fileCount} ${fileCount === 1 ? "file" : "files"}`,
      );
      if (changes.length > 0)
        out.details([["Operations", `${written} writes, ${deleted} deletes`]]);
    });
  },
});
