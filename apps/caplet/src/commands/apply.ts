import type { Diagnostic, ExecutableChange } from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import {
  appliedCounts,
  appliedLine,
  claudeJson,
  printClaude,
  printCompatibility,
  reportEmptyPlan,
  settleEmptyPlan,
} from "../internal/apply-flow.js";
import { applyEmitPlan } from "../internal/apply-plan.js";
import { readQuiet, readVerbose, readYes } from "../internal/args.js";
import { previewedDiffs } from "../internal/claude-gates.js";
import { type ClaudeReport, previewClaude } from "../internal/claude-host-flow.js";
import { confirm, runCommandSafely } from "../internal/command.js";
import { buildEmitPlan } from "../internal/emit-plan.js";
import {
  fetchScopes,
  installedExecutables,
  plannedExecutableChanges,
} from "../internal/fetch-scopes.js";
import { printJson, readJson } from "../internal/json.js";
import {
  blockingExitCode,
  exitCodeForDiagnostics,
  printDiagnostics,
  type Reporter,
  reporter,
} from "../internal/output.js";
import {
  buildPlanView,
  type PlanView,
  planToJson,
  reachBlock,
  reachToJson,
} from "../internal/plan-view.js";
import { specToCittyArgs } from "../internal/spec.js";
import { collectReach, type EmitPlan, type Reach } from "../internal/workflow.js";

export const applyCommand = defineCommand({
  meta: { name: "apply", description: "reconcile emitted files with your capability manifests" },
  args: specToCittyArgs("apply") as ArgsDef,
  async run(context) {
    await runCommandSafely("apply", context.args, () => applyManifests(context.args));
  },
});

/**
 * Plans the selected scopes and targets and applies the plan, or with `--dry-run` only reports it.
 */
async function applyManifests(args: Record<string, unknown>): Promise<void> {
  const json = readJson(args);
  const dryRun = args["dry-run"] === true;
  const frozen = args.frozen === true;
  const installed = await installedExecutables(args);
  const { plan, diagnostics } = await planApply(args, dryRun, frozen);
  if (!json) printDiagnostics(diagnostics, args);
  const frozenStale = frozen && diagnostics.some((d) => d.code.startsWith("acf.lock."));
  const blocking = frozenStale ? 3 : blockingExitCode(diagnostics, args);
  // A dry run shows the changes as apply will make them once the host has run.
  const preview = dryRun && blocking === 0 ? await previewClaude(plan) : undefined;
  const view = buildPlanView(previewedDiffs(plan, preview), { verbose: readVerbose(args) });
  const run: ApplyRun = {
    args,
    json,
    out: reporter(args),
    plan,
    diagnostics,
    view,
    executables: plannedExecutableChanges(installed, plan),
    reach: await collectReach(plan),
  };
  if (blocking !== 0) {
    if (json) printJson("apply", false, diagnostics, envelope(run, undefined));
    else {
      run.out.compatibility(plan.outcomes, plan.targets);
      if (plan.diffs.some((item) => item.conflict === true)) run.out.plan(view);
    }
    process.exitCode = blocking;
    return;
  }
  // Refused capabilities are already out of the plan for their targets; the rest applies.
  process.exitCode = exitCodeForDiagnostics(diagnostics, args);
  if (view.fileCount === 0) {
    await settleAndReport(run, dryRun, preview);
    return;
  }
  if (!json) {
    printCompatibility(run.out, plan, view.fileCount);
    run.out.plan(view);
    run.out.executables(run.executables);
  }
  if (dryRun) reportDryRun(run, preview);
  else if (await deletionsConfirmed(run)) await applyAndReport(run);
}

/** What every outcome of one `caplet apply` reports once the plan is built. */
type ApplyRun = {
  args: Record<string, unknown>;
  json: boolean;
  out: Reporter;
  plan: EmitPlan;
  /** Fetch and plan diagnostics. */
  diagnostics: readonly Diagnostic[];
  view: PlanView;
  executables: ExecutableChange[];
  reach: Reach;
};

/**
 * Fetches sources and plans them, including locked restores for frozen previews. Offline
 * runs validate snapshot availability without fetching. Dry runs discard disposable resolution.
 */
async function planApply(
  args: Record<string, unknown>,
  dryRun: boolean,
  frozen: boolean,
): Promise<{ plan: EmitPlan; diagnostics: Diagnostic[] }> {
  const fetched = await fetchScopes(args, args.offline === true ? "never" : "auto", undefined, {
    frozen,
    ...(dryRun ? { updateLock: false } : {}),
  });
  const previews = fetched.scopes.flatMap((scopeRoot, index) => {
    const result = fetched.results[index];
    return result?.preview === undefined ? [] : [{ scopeRoot, result, preview: result.preview }];
  });
  try {
    const plan = await buildEmitPlan(
      args,
      dryRun
        ? {
            locks: new Map(previews.map((item) => [item.scopeRoot.scope, item.result.lockfile])),
            capabilitiesDirs: new Map(
              previews.map((item) => [item.scopeRoot.scope, item.preview.capabilitiesDir]),
            ),
          }
        : undefined,
    );
    return { plan, diagnostics: [...fetched.diagnostics, ...plan.diagnostics] };
  } finally {
    await Promise.all(previews.map((item) => item.preview.dispose()));
  }
}

/** The `--json` envelope fields; `reach` and `claude` are left out while the plan is blocked. */
function envelope(
  run: ApplyRun,
  applied: unknown,
  after?: { reach: Reach; claude: ClaudeReport | undefined },
): Record<string, unknown> {
  return {
    plan: planToJson(run.view),
    ...(applied === undefined ? {} : { applied }),
    outcomes: run.plan.outcomes,
    executables: run.executables,
    ...(after === undefined ? {} : { ...reachToJson(after.reach), ...claudeJson(after.claude) }),
  };
}

function printReach(run: ApplyRun, reach: Reach): void {
  const scopes = run.plan.scopes.map((scopeRoot) => scopeRoot.scope);
  for (const line of reachBlock(reach, scopes)) run.out.log(line);
}

/** Settles and reports a plan with no file to write ({@link settleEmptyPlan}). */
async function settleAndReport(
  run: ApplyRun,
  dryRun: boolean,
  preview: ClaudeReport | undefined,
): Promise<void> {
  const { args, out, plan } = run;
  const settled = await settleEmptyPlan(plan, dryRun, preview);
  const all = [...run.diagnostics, ...settled.diagnostics];
  const code = exitCodeForDiagnostics(all, args);
  process.exitCode = code;
  if (run.json) {
    const after = { reach: run.reach, claude: settled.claude };
    printJson("apply", code === 0, all, envelope(run, settled.applied, after));
    return;
  }
  printDiagnostics(settled.diagnostics, args);
  printCompatibility(out, plan, run.view.fileCount);
  reportEmptyPlan(out, plan, dryRun);
  out.executables(run.executables);
  printClaude(out, settled.claude, dryRun ? "planned" : "applied");
  printReach(run, run.reach);
}

/**
 * Reports a dry run's plan with the Claude host commands it would run; nothing is written. A
 * failed read of Claude's state fails the dry run as it would fail apply.
 */
function reportDryRun(run: ApplyRun, claude: ClaudeReport | undefined): void {
  const previewed = claude?.diagnostics ?? [];
  const all = [...run.diagnostics, ...previewed];
  const code = exitCodeForDiagnostics(all, run.args);
  process.exitCode = code;
  if (run.json) {
    printJson("apply", code === 0, all, envelope(run, null, { reach: run.reach, claude }));
    return;
  }
  const count = run.view.fileCount;
  printDiagnostics(previewed, run.args);
  printClaude(run.out, claude, "planned");
  run.out.pending(`Dry run: ${count} ${count === 1 ? "change" : "changes"} not applied`);
  printReach(run, run.reach);
}

/**
 * Whether apply may go ahead: a plan that deletes files asks first, unless `--yes` or `--json`.
 * Declining prints `Aborted.` and exits 1.
 */
async function deletionsConfirmed(run: ApplyRun): Promise<boolean> {
  const deletions = run.view.totals.reduce((sum, item) => sum + item.delete, 0);
  if (deletions === 0 || run.json || readYes(run.args)) return true;
  const proceed = await confirm(
    `This plan deletes ${deletions} ${deletions === 1 ? "file" : "files"}. Continue?`,
  );
  if (!proceed) {
    run.out.log("Aborted.");
    process.exitCode = 1;
  }
  return proceed;
}

/** Applies the plan and reports what was written, the host block and the reach afterwards. */
async function applyAndReport(run: ApplyRun): Promise<void> {
  const { args, out, plan } = run;
  const applied = await applyEmitPlan(plan);
  const counts = appliedCounts(applied);
  const reach = await collectReach(plan);
  const all = [...run.diagnostics, ...applied.diagnostics];
  const code = exitCodeForDiagnostics(all, args);
  process.exitCode = code;
  if (run.json) {
    printJson("apply", code === 0, all, envelope(run, counts, { reach, claude: applied.claude }));
    return;
  }
  printDiagnostics(applied.diagnostics, args);
  out.log("");
  out.done(appliedLine(counts, run.view.fileCount));
  printClaude(out, applied.claude, "applied");
  out.log("");
  printReach(run, reach);
  if (!readVerbose(args) && !readQuiet(args)) out.log("  Full list: --verbose");
}
