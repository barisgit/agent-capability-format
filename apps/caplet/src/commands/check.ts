import path from "node:path";
import {
  type CapabilitiesLock,
  type Diagnostic,
  LockfileError,
  resolveScopeCapabilities,
} from "@caplet/core";
import { detectLockDrift, readCapabilitiesYml, readLockfile } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd, readScope } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { buildEmitPlan } from "../internal/emit-plan.js";
import { printJson, readJson } from "../internal/json.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output.js";
import { resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "validate manifests and detect stale outputs (CI-friendly)",
  },
  args: specToCittyArgs("check") as ArgsDef,
  async run(context) {
    await runCommandSafely("check", context.args, () => checkScopes(context.args));
  },
});

/**
 * Validates the manifests and capabilities, then reports whether the outputs are stale (exit 1),
 * the lock is stale under `--frozen` (exit 3) or anything is invalid (exit 2).
 */
async function checkScopes(args: Record<string, unknown>): Promise<void> {
  const cwd = readCwd(args);
  process.chdir(cwd);
  const diagnostics: Diagnostic[] = [];
  const lockDiagnostics: Diagnostic[] = [];
  const scopeRoots = await resolveScopeRoots(readScope(args), cwd);
  let capabilityCount = 0;
  for (const scopeRoot of scopeRoots) {
    const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
    diagnostics.push(...manifest.diagnostics);
    let lock: CapabilitiesLock | null;
    try {
      lock = await readLockfile(scopeRoot.lockPath);
    } catch (error) {
      if (!(error instanceof LockfileError)) throw error;
      diagnostics.push(error.diagnostic);
      continue;
    }
    lockDiagnostics.push(
      ...detectLockDrift(manifest.value, lock, path.dirname(scopeRoot.manifestPath)),
    );
    const resolved = await resolveScopeCapabilities(scopeRoot);
    diagnostics.push(...resolved.diagnostics);
    capabilityCount += resolved.capabilities.length;
    for (const capability of resolved.capabilities) diagnostics.push(...capability.diagnostics);
  }
  const json = readJson(args);
  const out = reporter(args);
  let reported = [...diagnostics, ...lockDiagnostics];
  const finish = (code: 0 | 1 | 2 | 3, result: string, pending: number, message: string) => {
    if (json) {
      printJson("check", code === 0, reported, {
        result,
        pending,
        capabilities: capabilityCount,
        scopes: scopeRoots.map((scopeRoot) => scopeRoot.scope),
      });
    } else {
      printDiagnostics(reported, args);
      if (code === 0 && result === "manual-cleanup") out.warn(message);
      else if (code === 0) out.done(message);
      else out.failure(message);
    }
    process.exitCode = code;
  };
  const invalid = exitCodeForDiagnostics(diagnostics, args);
  if (invalid !== 0) {
    finish(invalid === 4 ? 2 : invalid, "invalid", 0, "Validation failed");
    return;
  }
  if (args.frozen === true && lockDiagnostics.some((d) => d.severity !== "info")) {
    finish(3, "lock-stale", 0, "Lockfile is stale - run caplet update and commit the result");
    return;
  }
  const plan = await buildEmitPlan(args);
  // The plan repeats the validation and lock findings above and adds what emitting found,
  // such as a component apply refuses. Frozen lock staleness takes exit 3 above;
  // otherwise lock errors are invalid input just like any other error diagnostic.
  reported = plan.diagnostics;
  const planInvalid = exitCodeForDiagnostics(reported, args);
  if (planInvalid !== 0) {
    finish(2, "invalid", 0, "Validation failed");
    return;
  }
  const pending = plan.diffs.length;
  if (pending > 0) {
    finish(
      1,
      "stale",
      pending,
      `Outputs are stale - ${pending} ${pending === 1 ? "file" : "files"} pending. Run caplet apply.`,
    );
    return;
  }
  const residue = reported.some(
    (diagnostic) =>
      diagnostic.code === "acf.apply.drift" || diagnostic.code === "acf.migration.drifted",
  );
  finish(
    0,
    residue ? "manual-cleanup" : "clean",
    0,
    residue
      ? "No pending output changes; manual cleanup remains (see drift warnings)"
      : "Validation passed",
  );
  if (!json) {
    out.details([
      ["Capabilities", capabilityCount],
      ["Scopes", scopeRoots.map((scopeRoot) => scopeRoot.scope).join(", ")],
    ]);
  }
}
