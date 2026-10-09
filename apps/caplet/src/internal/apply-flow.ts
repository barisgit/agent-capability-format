import type { Diagnostic, ExecutableComponent } from "@caplet/core";
import { readVerbose } from "./args.js";
import {
  type ClaudeReport,
  type ClaudeScopeStatus,
  claudeLines,
  previewClaude,
} from "./claude-host-flow.js";
import { printJson, readJson } from "./json.js";
import {
  blockingExitCode,
  exitCodeForDiagnostics,
  printDiagnostics,
  type Reporter,
  reporter,
} from "./output.js";
import { buildPlanView, planToJson } from "./plan-view.js";
import {
  applyEmitPlan,
  buildEmitPlan,
  type EmitPlan,
  plannedExecutableChanges,
} from "./workflow.js";

/** What `add` or `update` hands to {@link planAndApply} after resolving its sources. */
export type PlanAndApplyInput = {
  command: "add" | "update";
  args: Record<string, unknown>;
  /** Diagnostics of the resolution that preceded the plan. */
  diagnostics: readonly Diagnostic[];
  /** {@link installedExecutables} read before the resolution replaced any snapshot. */
  installed: readonly ExecutableComponent[];
  /** Command-specific fields of the `--json` envelope. */
  payload: Record<string, unknown>;
  /** Human summary of the resolution, printed once nothing in the plan blocks writing. */
  announce?: () => void;
};

/**
 * Plans and applies the resolved scopes for `add` and `update`, printing the plan, the
 * executable change report and the applied counts, or one `--json` envelope with `plan`,
 * `applied` (null when nothing was written) and `executables`. The report never prompts or
 * blocks: adding or updating the source is the approval (design D10). Sets the exit code.
 */
export async function planAndApply(input: PlanAndApplyInput): Promise<void> {
  const { args, command } = input;
  const json = readJson(args);
  const out = reporter(args);
  const plan = await buildEmitPlan(args);
  const diagnostics = [...input.diagnostics, ...plan.diagnostics];
  const executables = plannedExecutableChanges(input.installed, plan);
  const view = buildPlanView(plan.diffs, { verbose: readVerbose(args) });
  const envelope = (applied: unknown, claude?: ClaudeReport) => ({
    ...input.payload,
    plan: planToJson(view),
    applied,
    executables,
    ...claudeJson(claude),
  });
  const blocking = blockingExitCode(diagnostics, args);
  // Refused capabilities are already out of the plan for their targets; the rest applies.
  const planCode = exitCodeForDiagnostics(diagnostics, args);
  process.exitCode = planCode;
  if (blocking !== 0) {
    if (json) printJson(command, false, diagnostics, envelope(null));
    else printDiagnostics(diagnostics, args);
    return;
  }
  if (!json) {
    printDiagnostics(diagnostics, args);
    input.announce?.();
  }
  if (view.fileCount === 0) {
    const settled = await settleEmptyPlan(plan, false);
    const all = [...diagnostics, ...settled.diagnostics];
    const code = exitCodeForDiagnostics(all, args);
    process.exitCode = code;
    if (json) printJson(command, code === 0, all, envelope(settled.applied, settled.claude));
    else {
      printDiagnostics(settled.diagnostics, args);
      reportEmptyPlan(out, plan, false);
      out.executables(executables);
      printClaude(out, settled.claude, "applied");
    }
    return;
  }
  if (!json) {
    out.log("");
    out.plan(view);
    out.executables(executables);
  }
  const applied = await applyEmitPlan(plan);
  const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
  const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
  const applyCode = exitCodeForDiagnostics([...diagnostics, ...applied.diagnostics], args);
  process.exitCode = applyCode;
  if (json) {
    printJson(
      command,
      applyCode === 0,
      [...diagnostics, ...applied.diagnostics],
      envelope({ files: view.fileCount, writes: written, deletes: deleted }, applied.claude),
    );
    return;
  }
  printDiagnostics(applied.diagnostics, args);
  out.log("");
  out.done(
    `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
  );
  printClaude(out, applied.claude, "applied");
}

/** Prints the Claude host block of a report, after a blank line, when there is one. */
export function printClaude(
  out: Reporter,
  report: ClaudeReport | undefined,
  mode: "applied" | "planned",
): void {
  const lines = report === undefined ? [] : claudeLines(report, mode);
  if (lines.length === 0) return;
  out.log("");
  for (const line of lines) out.log(line);
}

/** The `applied` field of a `--json` envelope for a plan that wrote no file. */
export type EmptyPlanApplied = { files: 0; writes: 0; deletes: 0 } | null;

/** What settling a plan without file changes did; `diagnostics` are apply's own. */
export type SettledEmptyPlan = {
  applied: EmptyPlanApplied;
  claude: ClaudeReport | undefined;
  diagnostics: Diagnostic[];
};

/**
 * Settles a plan with no file to write, the same way for `apply`, `add` and `update`: removes the
 * stale sidecar entries the plan carries and reconciles its Claude install roots with the host,
 * because registration can lag the files (a missing CLI or a failed command on an earlier apply).
 * `applied` is the `--json` value: zero counts when entries were removed, otherwise null. A dry
 * run changes nothing and previews the Claude commands.
 */
export async function settleEmptyPlan(plan: EmitPlan, dryRun: boolean): Promise<SettledEmptyPlan> {
  if (dryRun) {
    const claude = await previewClaude(plan.claude, plan.cwd);
    return { applied: null, claude, diagnostics: claude?.diagnostics ?? [] };
  }
  if (plan.staleEntries.length === 0 && plan.claude.length === 0) {
    return { applied: null, claude: undefined, diagnostics: [] };
  }
  const summary = await applyEmitPlan(plan);
  return {
    applied: plan.staleEntries.length > 0 ? { files: 0, writes: 0, deletes: 0 } : null,
    claude: summary.claude,
    diagnostics: summary.diagnostics,
  };
}

/** The `claude` field of a `--json` envelope, present when the plan has Claude install roots. */
export function claudeJson(report: ClaudeReport | undefined): { claude?: ClaudeScopeStatus[] } {
  return report === undefined ? {} : { claude: report.scopes };
}

/** Prints the status line of a plan with no file to write, after {@link settleEmptyPlan}. */
export function reportEmptyPlan(out: Reporter, plan: EmitPlan, dryRun: boolean): void {
  const stale = plan.staleEntries.length;
  const entries = `${stale} stale sidecar ${stale === 1 ? "entry" : "entries"}`;
  if (stale > 0 && dryRun) out.pending(`${entries} to clean up`);
  else if (stale > 0) out.done(`Cleaned up ${entries}`);
  else if (plan.blocked.length > 0) out.warn("Nothing else to apply");
  else out.done("Everything up to date");
}
