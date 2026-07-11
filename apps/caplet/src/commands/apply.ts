import { defineCommand } from "citty";
import {
  globalArgs,
  readFetchMode,
  readQuiet,
  readVerbose,
  readYes,
  targetArg,
} from "../internal/args";
import { confirm, runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
import { applyEmitPlan, buildEmitPlan, fetchScopes } from "../internal/workflow";

export const applyCommand = defineCommand({
  meta: { name: "apply", description: "reconcile emitted files with your capability manifests" },
  args: {
    ...globalArgs,
    ...targetArg,
    "dry-run": {
      type: "boolean",
      alias: "n",
      default: false,
      description: "show the change plan without writing anything",
    },
    offline: {
      type: "boolean",
      default: false,
      description: "never fetch; use the lockfile as-is",
    },
    frozen: {
      type: "boolean",
      default: false,
      description: "fail (exit 3) if the lockfile is stale",
    },
    mode: {
      type: "string",
      description: "deprecated: use --offline (never) or caplet update (force)",
    },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const dryRun = context.args["dry-run"] === true;
      const fetched = dryRun
        ? { diagnostics: [] }
        : await fetchScopes(context.args, readFetchMode(context.args));
      const plan = await buildEmitPlan(context.args);
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      printDiagnostics(diagnostics, context.args);
      if (context.args.frozen === true && diagnostics.some((d) => d.code.startsWith("acf.lock."))) {
        process.exitCode = 3;
        return;
      }
      const code = exitCodeForDiagnostics(diagnostics, context.args);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
      const out = reporter(context.args);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      if (view.fileCount === 0) {
        out.done("Everything up to date");
        return;
      }
      out.plan(view);
      if (dryRun) {
        out.pending(`${view.fileCount} ${view.fileCount === 1 ? "file" : "files"}`);
        return;
      }
      const deletions = view.totals.reduce((sum, item) => sum + item.delete, 0);
      if (deletions > 0 && !readYes(context.args)) {
        const proceed = await confirm(
          `This plan deletes ${deletions} ${deletions === 1 ? "file" : "files"}. Continue?`,
        );
        if (!proceed) {
          out.log("Aborted.");
          process.exitCode = 1;
          return;
        }
      }
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
      if (!readVerbose(context.args) && !readQuiet(context.args)) {
        out.log(`  ${"Full list: --verbose"}`);
      }
    });
  },
});
