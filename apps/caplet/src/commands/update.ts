import { readLockfile } from "@acf/installer";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd, readScope, readVerbose, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import {
  exitCodeForDiagnostics,
  finishWithDiagnostics,
  printDiagnostics,
  reporter,
} from "../internal/output";
import { buildPlanView } from "../internal/plan-view";
import { resolveScopeRoots } from "../internal/scopes";
import { specToCittyArgs } from "../internal/spec";
import { applyEmitPlan, buildEmitPlan, fetchScopes } from "../internal/workflow";

export const updateCommand = defineCommand({
  meta: { name: "update", description: "re-resolve sources to their latest refs and apply" },
  args: specToCittyArgs("update") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = typeof context.args.name === "string" ? context.args.name : undefined;
      if (name !== undefined) await ensureKnownName(context.args, name);
      const result = await fetchScopes(context.args, "force", name);
      const count = result.results.reduce(
        (sum, item) =>
          sum +
          item.capabilities.filter((capability) => name === undefined || capability.name === name)
            .length,
        0,
      );
      const out = reporter(context.args);
      if (context.args.apply === false) {
        const code = finishWithDiagnostics(result.diagnostics, context.args);
        if (code === 0) {
          out.done(name === undefined ? `Updated ${count} capabilities` : `Updated ${name}`);
          out.details([["Resolved", `${count} ${count === 1 ? "capability" : "capabilities"}`]]);
        }
        process.exitCode = code;
        return;
      }
      const plan = await buildEmitPlan(context.args);
      const diagnostics = [...result.diagnostics, ...plan.diagnostics];
      printDiagnostics(diagnostics, context.args);
      const code = exitCodeForDiagnostics(diagnostics, context.args);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
      out.done(name === undefined ? `Updated ${count} capabilities` : `Updated ${name}`);
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      if (view.fileCount === 0) {
        out.done("Everything up to date");
        return;
      }
      out.log("");
      out.plan(view);
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
    });
  },
});

async function ensureKnownName(args: Record<string, unknown>, name: string): Promise<void> {
  const cwd = readCwd(args);
  for (const root of await resolveScopeRoots(readScope(args), cwd)) {
    const lock = await readLockfile(root.lockPath);
    if (lock?.entries.some((entry) => entry.capabilityNames.includes(name)) === true) return;
  }
  throw validationError(`unknown capability: ${name}`);
}
