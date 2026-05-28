import { defineCommand } from "citty";
import { globalArgs } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildEmitPlan, summarizeDiffs } from "../internal/workflow";

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
      const out = reporter(context.args);
      for (const line of summarizeDiffs(plan.diffs)) out.log(line);
      out.log(`${plan.diffs.length} pending diffs`);
      process.exitCode = exitCodeForDiagnostics(plan.diagnostics, context.args);
    });
  },
});
