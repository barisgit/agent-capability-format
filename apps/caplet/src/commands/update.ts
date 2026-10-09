import { executableChanges } from "@caplet/core";
import { readLockfile } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { planAndApply } from "../internal/apply-flow.js";
import { readCwd, readScope, validationError } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { fetchScopes, installedExecutables } from "../internal/fetch-scopes.js";
import { printJson, readJson } from "../internal/json.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output.js";
import { resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";

export const updateCommand = defineCommand({
  meta: { name: "update", description: "re-resolve sources to their latest refs and apply" },
  args: specToCittyArgs("update") as ArgsDef,
  async run(context) {
    await runCommandSafely("update", context.args, () => updateSources(context.args));
  },
});

/**
 * Re-resolves the sources (one capability's with `name`) and applies them unless `--no-apply`.
 */
async function updateSources(args: Record<string, unknown>): Promise<void> {
  const name = typeof args.name === "string" ? args.name : undefined;
  if (name !== undefined) await ensureKnownName(args, name);
  const installed = await installedExecutables(args);
  const result = await fetchScopes(args, "force", name);
  const count = result.results.reduce(
    (sum, item) =>
      sum +
      item.capabilities.filter((capability) => name === undefined || capability.name === name)
        .length,
    0,
  );
  const out = reporter(args);
  const announce = () => {
    out.done(
      name === undefined
        ? `Updated ${count} ${count === 1 ? "capability" : "capabilities"}`
        : `Updated ${name}`,
    );
  };
  if (args.apply === false) {
    // Nothing is planned, so the report compares the snapshots the update just installed.
    const executables = executableChanges(installed, await installedExecutables(args));
    const code = exitCodeForDiagnostics(result.diagnostics, args);
    process.exitCode = code;
    if (readJson(args)) {
      printJson("update", code === 0, result.diagnostics, {
        updated: count,
        plan: null,
        applied: null,
        executables,
      });
      return;
    }
    printDiagnostics(result.diagnostics, args);
    if (code === 0) {
      announce();
      out.details([["Resolved", `${count} ${count === 1 ? "capability" : "capabilities"}`]]);
    }
    out.executables(executables);
    return;
  }
  await planAndApply({
    command: "update",
    args: args,
    diagnostics: result.diagnostics,
    installed,
    payload: { updated: count },
    announce,
  });
}

async function ensureKnownName(args: Record<string, unknown>, name: string): Promise<void> {
  const cwd = readCwd(args);
  for (const root of await resolveScopeRoots(readScope(args), cwd)) {
    const lock = await readLockfile(root.lockPath);
    if (lock?.entries.some((entry) => entry.capabilityNames.includes(name)) === true) return;
  }
  throw validationError(`unknown capability: ${name}`);
}
