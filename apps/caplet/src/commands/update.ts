import { executableChanges } from "@caplet/core";
import { readLockfile } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { planAndApply } from "../internal/apply-flow.js";
import { readCwd, readScope, validationError } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { printJson, readJson } from "../internal/json.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output.js";
import { resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";
import { fetchScopes, installedExecutables } from "../internal/workflow.js";

export const updateCommand = defineCommand({
  meta: { name: "update", description: "re-resolve sources to their latest refs and apply" },
  args: specToCittyArgs("update") as ArgsDef,
  async run(context) {
    await runCommandSafely("update", context.args, async () => {
      const name = typeof context.args.name === "string" ? context.args.name : undefined;
      if (name !== undefined) await ensureKnownName(context.args, name);
      const installed = await installedExecutables(context.args);
      const result = await fetchScopes(context.args, "force", name);
      const count = result.results.reduce(
        (sum, item) =>
          sum +
          item.capabilities.filter((capability) => name === undefined || capability.name === name)
            .length,
        0,
      );
      const out = reporter(context.args);
      const announce = () => {
        out.done(
          name === undefined
            ? `Updated ${count} ${count === 1 ? "capability" : "capabilities"}`
            : `Updated ${name}`,
        );
      };
      if (context.args.apply === false) {
        // Nothing is planned, so the report compares the snapshots the update just installed.
        const executables = executableChanges(installed, await installedExecutables(context.args));
        const code = exitCodeForDiagnostics(result.diagnostics, context.args);
        process.exitCode = code;
        if (readJson(context.args)) {
          printJson("update", code === 0, result.diagnostics, {
            updated: count,
            plan: null,
            applied: null,
            executables,
          });
          return;
        }
        printDiagnostics(result.diagnostics, context.args);
        if (code === 0) {
          announce();
          out.details([["Resolved", `${count} ${count === 1 ? "capability" : "capabilities"}`]]);
        }
        out.executables(executables);
        return;
      }
      await planAndApply({
        command: "update",
        args: context.args,
        diagnostics: result.diagnostics,
        installed,
        payload: { updated: count },
        announce,
      });
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
