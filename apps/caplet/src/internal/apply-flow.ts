import { type Diagnostic, type ExecutableComponent, executableChanges } from "@caplet/core";
import { readVerbose } from "./args.js";
import { printJson, readJson } from "./json.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "./output.js";
import { buildPlanView, planToJson } from "./plan-view.js";
import { applyEmitPlan, buildEmitPlan } from "./workflow.js";

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
  /** Human summary of the resolution, printed once the plan has no errors. */
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
  const executables = executableChanges(input.installed, plan.executables);
  const view = buildPlanView(plan.diffs, { verbose: readVerbose(args) });
  const envelope = (applied: unknown) => ({
    ...input.payload,
    plan: planToJson(view),
    applied,
    executables,
  });
  const code = exitCodeForDiagnostics(diagnostics, args);
  process.exitCode = code;
  if (code !== 0) {
    if (json) printJson(command, false, diagnostics, envelope(null));
    else printDiagnostics(diagnostics, args);
    return;
  }
  if (!json) {
    printDiagnostics(diagnostics, args);
    input.announce?.();
  }
  if (view.fileCount === 0) {
    if (json) printJson(command, true, diagnostics, envelope(null));
    else {
      out.done("Everything up to date");
      out.executables(executables);
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
  const applyCode = exitCodeForDiagnostics(applied.diagnostics, args);
  process.exitCode = applyCode;
  if (json) {
    printJson(
      command,
      applyCode === 0,
      [...diagnostics, ...applied.diagnostics],
      envelope({ files: view.fileCount, writes: written, deletes: deleted }),
    );
    return;
  }
  printDiagnostics(applied.diagnostics, args);
  out.log("");
  out.done(
    `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
  );
}
