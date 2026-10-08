import { executableChanges } from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { readFetchMode, readQuiet, readVerbose, readYes } from "../internal/args.js";
import { confirm, runCommandSafely } from "../internal/command.js";
import { printJson, readJson } from "../internal/json.js";
import {
  blockingExitCode,
  exitCodeForDiagnostics,
  printDiagnostics,
  reporter,
} from "../internal/output.js";
import { buildPlanView, planToJson, reachBlock, reachToJson } from "../internal/plan-view.js";
import { specToCittyArgs } from "../internal/spec.js";
import {
  applyEmitPlan,
  buildEmitPlan,
  collectReach,
  fetchScopes,
  installedExecutables,
} from "../internal/workflow.js";

export const applyCommand = defineCommand({
  meta: { name: "apply", description: "reconcile emitted files with your capability manifests" },
  args: specToCittyArgs("apply") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const json = readJson(context.args);
      const dryRun = context.args["dry-run"] === true;
      const frozen = context.args.frozen === true;
      const simulate = dryRun && !frozen;
      const installed = await installedExecutables(context.args);
      const fetched =
        dryRun && frozen
          ? { scopes: [], results: [], diagnostics: [] }
          : await fetchScopes(
              context.args,
              readFetchMode(context.args),
              undefined,
              simulate ? { updateLock: false } : undefined,
            );
      // A simulated apply plans against the previewed lock and snapshots, then discards them.
      const previews = fetched.scopes.flatMap((scopeRoot, index) => {
        const result = fetched.results[index];
        return result?.preview === undefined
          ? []
          : [{ scopeRoot, result, preview: result.preview }];
      });
      let plan: Awaited<ReturnType<typeof buildEmitPlan>>;
      try {
        plan = await buildEmitPlan(
          context.args,
          simulate
            ? {
                locks: new Map(
                  previews.map((item) => [item.scopeRoot.scope, item.result.lockfile]),
                ),
                capabilitiesDirs: new Map(
                  previews.map((item) => [item.scopeRoot.scope, item.preview.capabilitiesDir]),
                ),
              }
            : undefined,
        );
      } finally {
        await Promise.all(previews.map((item) => item.preview.dispose()));
      }
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      if (!json) printDiagnostics(diagnostics, context.args);
      const frozenStale = frozen && diagnostics.some((d) => d.code.startsWith("acf.lock."));
      const blocking = frozenStale ? 3 : blockingExitCode(diagnostics, context.args);
      // Refusals left their components out of the plan; the rest still applies.
      const planCode = exitCodeForDiagnostics(diagnostics, context.args);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      const reach = await collectReach(plan);
      const out = reporter(context.args);
      const executables = executableChanges(installed, plan.executables);
      const outcomes = { outcomes: plan.outcomes, executables };
      if (blocking !== 0) {
        if (json) {
          printJson("apply", false, diagnostics, { plan: planToJson(view), ...outcomes });
        } else {
          out.compatibility(plan.outcomes, plan.targets);
        }
        process.exitCode = blocking;
        return;
      }
      process.exitCode = planCode;
      if (view.fileCount === 0) {
        const stale = plan.staleEntries.length;
        if (stale > 0 && !dryRun) await applyEmitPlan(plan);
        if (json) {
          printJson("apply", planCode === 0, diagnostics, {
            plan: planToJson(view),
            applied: stale > 0 && !dryRun ? { files: 0, writes: 0, deletes: 0 } : null,
            ...outcomes,
            ...reachToJson(reach),
          });
        } else if (stale > 0) {
          if (dryRun) {
            out.pending(`${stale} stale sidecar ${stale === 1 ? "entry" : "entries"} to clean up`);
          } else {
            out.done(`Cleaned up ${stale} stale sidecar ${stale === 1 ? "entry" : "entries"}`);
          }
          out.executables(executables);
          for (const line of reachBlock(
            reach,
            plan.scopes.map((scopeRoot) => scopeRoot.scope),
          ))
            out.log(line);
        } else {
          out.done("Everything up to date");
          out.executables(executables);
          for (const line of reachBlock(
            reach,
            plan.scopes.map((scopeRoot) => scopeRoot.scope),
          ))
            out.log(line);
        }
        return;
      }
      if (!json) {
        out.compatibility(plan.outcomes, plan.targets);
        out.plan(view);
        out.executables(executables);
      }
      if (dryRun) {
        if (json) {
          printJson("apply", planCode === 0, diagnostics, {
            plan: planToJson(view),
            applied: null,
            ...outcomes,
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
      const applyCode = exitCodeForDiagnostics(
        [...diagnostics, ...applied.diagnostics],
        context.args,
      );
      process.exitCode = applyCode;
      if (json) {
        printJson("apply", applyCode === 0, [...diagnostics, ...applied.diagnostics], {
          plan: planToJson(view),
          applied: { files: view.fileCount, writes: written, deletes: deleted },
          ...outcomes,
          ...reachToJson(appliedReach),
        });
        return;
      }
      printDiagnostics(applied.diagnostics, context.args);
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
