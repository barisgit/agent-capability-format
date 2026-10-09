import type { Diagnostic, ExecutableComponent } from "@caplet/core";
import { readVerbose } from "./args.js";
import {
  type ClaudeReport,
  type ClaudeScopeStatus,
  claudeLines,
  previewClaude,
} from "./claude-host-flow.js";
import { renamesJson } from "./claude-migration.js";
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
  type ApplySummary,
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
 * Plans and applies the resolved scopes for `add` and `update`, printing the compatibility
 * report, the plan, the executable change report and the applied counts as `apply` does, or one
 * `--json` envelope with `plan`, `applied` (null when nothing was written), `outcomes` and
 * `executables`. The report never prompts or
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
    outcomes: plan.outcomes,
    executables,
    ...claudeJson(claude),
  });
  const blocking = blockingExitCode(diagnostics, args);
  // Refused capabilities are already out of the plan for their targets; the rest applies.
  const planCode = exitCodeForDiagnostics(diagnostics, args);
  process.exitCode = planCode;
  if (blocking !== 0) {
    if (json) printJson(command, false, diagnostics, envelope(null));
    else {
      printDiagnostics(diagnostics, args);
      out.compatibility(plan.outcomes, plan.targets);
    }
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
      printCompatibility(out, plan, view.fileCount);
      reportEmptyPlan(out, plan, false);
      out.executables(executables);
      printClaude(out, settled.claude, "applied");
    }
    return;
  }
  if (!json) {
    out.log("");
    printCompatibility(out, plan, view.fileCount);
    out.plan(view);
    out.executables(executables);
  }
  const applied = await applyEmitPlan(plan);
  const counts = appliedCounts(applied);
  const applyCode = exitCodeForDiagnostics([...diagnostics, ...applied.diagnostics], args);
  process.exitCode = applyCode;
  if (json) {
    printJson(
      command,
      applyCode === 0,
      [...diagnostics, ...applied.diagnostics],
      envelope(counts, applied.claude),
    );
    return;
  }
  printDiagnostics(applied.diagnostics, args);
  out.log("");
  out.done(appliedLine(counts, view.fileCount));
  printClaude(out, applied.claude, "applied");
}

/** The `applied` field of a `--json` envelope: distinct files apply wrote or deleted. */
export type AppliedCounts = { files: number; writes: number; deletes: number };

/**
 * Counts the files apply changed. A plan's file can stay unapplied (drifted, or behind a Claude
 * host gate), and a file can be written twice (an inventory regenerated after held-back
 * changes), so the counts come from the results' distinct paths, not from the plan.
 */
export function appliedCounts(summary: Pick<ApplySummary, "results">): AppliedCounts {
  const written = new Set(summary.results.flatMap((result) => result.written));
  const deleted = new Set(summary.results.flatMap((result) => result.deleted));
  for (const file of deleted) written.delete(file);
  return { files: written.size + deleted.size, writes: written.size, deletes: deleted.size };
}

/** `Applied N files (W writes, D deletes)`, naming the planned total when apply did less. */
export function appliedLine(counts: AppliedCounts, planned: number): string {
  const { files, writes, deletes } = counts;
  const total = files < planned ? `${files} of ${planned}` : String(files);
  return `Applied ${total} ${planned === 1 && files === 1 ? "file" : "files"} (${writes} ${writes === 1 ? "write" : "writes"}, ${deletes} ${deletes === 1 ? "delete" : "deletes"})`;
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
export async function settleEmptyPlan(
  plan: EmitPlan,
  dryRun: boolean,
  preview?: ClaudeReport,
): Promise<SettledEmptyPlan> {
  if (dryRun) {
    const claude = preview ?? (await previewClaude(plan));
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

/**
 * The `claude` field of a `--json` envelope, present when the plan has Claude install roots, and
 * `renames` when the one-time invocation rename notice applies.
 */
export function claudeJson(report: ClaudeReport | undefined): {
  claude?: ClaudeScopeStatus[];
  renames?: ReturnType<typeof renamesJson>;
} {
  if (report === undefined) return {};
  const renames = report.renames ?? [];
  return renames.length === 0
    ? { claude: report.scopes }
    : { claude: report.scopes, renames: renamesJson(renames) };
}

/**
 * Prints the compatibility report of a plan that is not blocked from writing: before its files,
 * or, for a plan with no file to write, only while a refusal blocks a capability, because that
 * is then the one thing left to do.
 */
export function printCompatibility(
  out: Reporter,
  plan: Pick<EmitPlan, "outcomes" | "targets" | "blocked">,
  fileCount: number,
): void {
  if (fileCount > 0 || plan.blocked.length > 0) out.compatibility(plan.outcomes, plan.targets);
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
