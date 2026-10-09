import { type ArgsDef, defineCommand } from "citty";
import {
  claudeJson,
  printClaude,
  reportEmptyPlan,
  settleEmptyPlan,
} from "../internal/apply-flow.js";
import { readFetchMode, readQuiet, readVerbose, readYes } from "../internal/args.js";
import { previewClaude } from "../internal/claude-host-flow.js";
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
  plannedExecutableChanges,
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
      // Refused capabilities are already out of the plan for their targets; the rest applies.
      const planCode = exitCodeForDiagnostics(diagnostics, context.args);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      const reach = await collectReach(plan);
      const out = reporter(context.args);
      const executables = plannedExecutableChanges(installed, plan);
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
        const settled = await settleEmptyPlan(plan, dryRun);
        const all = [...diagnostics, ...settled.diagnostics];
        const code = exitCodeForDiagnostics(all, context.args);
        process.exitCode = code;
        if (json) {
          printJson("apply", code === 0, all, {
            plan: planToJson(view),
            applied: settled.applied,
            ...outcomes,
            ...reachToJson(reach),
            ...claudeJson(settled.claude),
          });
          return;
        }
        printDiagnostics(settled.diagnostics, context.args);
        // Blocked capabilities are the one thing left to do, so their report stays visible.
        if (plan.blocked.length > 0) out.compatibility(plan.outcomes, plan.targets);
        reportEmptyPlan(out, plan, dryRun);
        out.executables(executables);
        printClaude(out, settled.claude, dryRun ? "planned" : "applied");
        for (const line of reachBlock(
          reach,
          plan.scopes.map((scopeRoot) => scopeRoot.scope),
        ))
          out.log(line);
        return;
      }
      if (!json) {
        out.compatibility(plan.outcomes, plan.targets);
        out.plan(view);
        out.executables(executables);
      }
      if (dryRun) {
        const claude = await previewClaude(plan.claude, plan.cwd);
        const previewed = claude?.diagnostics ?? [];
        if (json) {
          printJson("apply", planCode === 0, [...diagnostics, ...previewed], {
            plan: planToJson(view),
            applied: null,
            ...outcomes,
            ...reachToJson(reach),
            ...claudeJson(claude),
          });
        } else {
          printDiagnostics(previewed, context.args);
          printClaude(out, claude, "planned");
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
          ...claudeJson(applied.claude),
        });
        return;
      }
      printDiagnostics(applied.diagnostics, context.args);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
      printClaude(out, applied.claude, "applied");
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
