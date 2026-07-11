import { defineCommand } from "citty";
import { globalArgs } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import {
  exitCodeForDiagnostics,
  printChanges,
  printDiagnostics,
  reporter,
} from "../internal/output";
import { buildEmitPlan, countPresentedFiles, describeDiffs } from "../internal/workflow";

export const diffCommand = defineCommand({
  meta: { name: "diff", description: "show pending FileDiffs without applying" },
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
      const changes = describeDiffs(plan.diffs);
      const fileCount = countPresentedFiles(changes);
      out.heading("diff");
      printChanges(out, changes);
      if (changes.length === 0) {
        out.log("");
        out.done("Output is up to date");
      } else {
        out.pending(`${fileCount} ${fileCount === 1 ? "file" : "files"}`);
      }
      process.exitCode = code;
    });
  },
});
