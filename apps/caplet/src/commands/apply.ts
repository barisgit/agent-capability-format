import { type ArgsDef, defineCommand } from "citty";
import { readFetchMode, readQuiet, readVerbose, readYes } from "../internal/args";
import { confirm, runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { buildPlanView, planToJson, reachBlock, reachToJson } from "../internal/plan-view";
import { specToCittyArgs } from "../internal/spec";
import { applyEmitPlan, buildEmitPlan, collectReach, fetchScopes } from "../internal/workflow";

export const applyCommand = defineCommand({
  meta: { name: "apply", description: "reconcile emitted files with your capability manifests" },
  args: specToCittyArgs("apply") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const json = readJson(context.args);
      const dryRun = context.args["dry-run"] === true;
      const frozen = context.args.frozen === true;
      const simulate = dryRun && !frozen;
      const fetched =
        dryRun && frozen
          ? { scopes: [], results: [], diagnostics: [] }
          : await fetchScopes(
              context.args,
              readFetchMode(context.args),
              undefined,
              simulate ? { updateLock: false } : undefined,
            );
      const locks = simulate
        ? new Map(
            fetched.scopes.flatMap((scopeRoot, index) => {
              const result = fetched.results[index];
              return result === undefined ? [] : ([[scopeRoot.scope, result.lockfile]] as const);
            }),
          )
        : undefined;
      const plan = await buildEmitPlan(context.args, locks === undefined ? undefined : { locks });
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      if (!json) printDiagnostics(diagnostics, context.args);
      const frozenStale = frozen && diagnostics.some((d) => d.code.startsWith("acf.lock."));
      const code = frozenStale ? 3 : exitCodeForDiagnostics(diagnostics, context.args);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      const reach = await collectReach(plan);
      if (code !== 0) {
        if (json) printJson("apply", false, diagnostics, { plan: planToJson(view) });
        process.exitCode = code;
        return;
      }
      const out = reporter(context.args);
      if (view.fileCount === 0) {
        if (json) {
          printJson("apply", true, diagnostics, {
            plan: planToJson(view),
            applied: null,
            ...reachToJson(reach),
          });
        } else {
          out.done("Everything up to date");
          for (const line of reachBlock(
            reach,
            plan.scopes.map((scopeRoot) => scopeRoot.scope),
          ))
            out.log(line);
        }
        return;
      }
      if (!json) out.plan(view);
      if (dryRun) {
        if (json) {
          printJson("apply", true, diagnostics, {
            plan: planToJson(view),
            applied: null,
            ...reachToJson(reach),
          });
        } else {
          out.pending(`${view.fileCount} ${view.fileCount === 1 ? "file" : "files"}`);
          for (const line of reachBlock(
            reach,
            plan.scopes.map((scopeRoot) => scopeRoot.scope),
          ))
            out.log(line);
        }
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
      const appliedReach = await collectReach(plan);
      if (json) {
        printJson("apply", true, diagnostics, {
          plan: planToJson(view),
          applied: { files: view.fileCount, writes: written, deletes: deleted },
          ...reachToJson(appliedReach),
        });
        return;
      }
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
      out.log("");
      for (const line of reachBlock(
        appliedReach,
        plan.scopes.map((scopeRoot) => scopeRoot.scope),
      ))
        out.log(line);
      if (!readVerbose(context.args) && !readQuiet(context.args)) {
        out.log(`  ${"Full list: --verbose"}`);
      }
    });
  },
});
