import { defineCommand } from "citty";
import { globalArgs, readFetchMode } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printChanges, printDiagnostics, reporter } from "../internal/output";
import { applyEmitPlan, buildEmitPlan, describeDiffs, fetchScopes } from "../internal/workflow";

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
      const changes = describeDiffs(plan.diffs);
      out.heading("apply");
      printChanges(out, changes);
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(changes.length === 0 ? "Output is up to date" : `Applied ${changes.length} ${changes.length === 1 ? "file" : "files"}`);
      if (changes.length > 0) out.details([["Operations", `${written} writes, ${deleted} deletes`]]);
    });
  },
});
