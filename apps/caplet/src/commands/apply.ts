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
import { printJson, readJson } from "../internal/json";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView, planToJson } from "../internal/plan-view";
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
      const json = readJson(context.args);
      const dryRun = context.args["dry-run"] === true;
      const fetched = dryRun
        ? { diagnostics: [] }
        : await fetchScopes(context.args, readFetchMode(context.args));
      const plan = await buildEmitPlan(context.args);
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      if (!json) printDiagnostics(diagnostics, context.args);
      const frozenStale =
        context.args.frozen === true && diagnostics.some((d) => d.code.startsWith("acf.lock."));
      const code = frozenStale ? 3 : exitCodeForDiagnostics(diagnostics, context.args);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      if (code !== 0) {
        if (json) printJson("apply", false, diagnostics, { plan: planToJson(view) });
        process.exitCode = code;
        return;
      }
      const out = reporter(context.args);
      if (view.fileCount === 0) {
        if (json) printJson("apply", true, diagnostics, { plan: planToJson(view), applied: null });
        else out.done("Everything up to date");
        return;
      }
      if (!json) out.plan(view);
      if (dryRun) {
        if (json) printJson("apply", true, diagnostics, { plan: planToJson(view), applied: null });
        else out.pending(`${view.fileCount} ${view.fileCount === 1 ? "file" : "files"}`);
        return;
      }
      const deletions = view.totals.reduce((sum, item) => sum + item.delete, 0);
      if (deletions > 0 && !json && !readYes(context.args)) {
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
      if (json) {
        printJson("apply", true, diagnostics, {
          plan: planToJson(view),
          applied: { files: view.fileCount, writes: written, deletes: deleted },
        });
        return;
      }
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
