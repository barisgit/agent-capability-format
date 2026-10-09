import path from "node:path";
import { readCapletConfig, targetIds } from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { ownedPathViolations, readSidecar } from "../apply/sidecar.js";
import { appliedCounts, claudeJson, printClaude } from "../internal/apply-flow.js";
import { readCwd, readExplicitScope, validationError } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { printJson, readJson } from "../internal/json.js";
import { removeManifestEntries } from "../internal/manifest.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output.js";
import { planRemoval, removalRoots } from "../internal/removal.js";
import { inferScope, resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";
import { applyEmitPlan, requestedTargets } from "../internal/workflow.js";

export const removeCommand = defineCommand({
  meta: { name: "remove", description: "remove a capability and its managed output" },
  args: specToCittyArgs("remove") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const names = removalNames(context.args);
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const json = readJson(context.args);
      const scope = await inferScope(readExplicitScope(context.args), cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      const config = (await readCapletConfig(cwd)).config;
      const targets = requestedTargets(context.args) ?? [...targetIds];
      const resolvedCwd = path.resolve(cwd);
      const roots = removalRoots({ scopeRoot: root, targets, config, cwd: resolvedCwd });
      // Check every root before changing anything so a refused removal leaves the manifest,
      // the outputs and the sidecars as they were.
      const violations: string[] = [];
      for (const { installRoot, boundary } of roots) {
        const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
        for (const name of names) {
          violations.push(...(await ownedPathViolations(sidecar, installRoot, name, boundary)));
        }
      }
      if (violations.length > 0) {
        throw validationError(`refusing to remove ${names.join(", ")}: ${violations.join("; ")}`);
      }
      const plan = await planRemoval({ cwd: resolvedCwd, roots, names });
      await removeManifestEntries(root, names);
      const applied = await applyEmitPlan(plan);
      const diagnostics = [...plan.diagnostics, ...applied.diagnostics];
      const exitCode = exitCodeForDiagnostics(diagnostics, context.args);
      if (json) {
        printJson("remove", exitCode === 0, diagnostics, {
          removed: names,
          scope,
          applied: appliedCounts(applied),
          ...claudeJson(applied.claude),
        });
      } else {
        const out = reporter(context.args);
        const { files } = appliedCounts(applied);
        out.done(`Removed ${names.join(", ")} (${scope} scope)`);
        out.details([["Managed", `${files} managed ${files === 1 ? "file" : "files"} cleaned`]]);
        printClaude(out, applied.claude, "applied");
        printDiagnostics(diagnostics, context.args);
      }
      if (exitCode !== 0) process.exitCode = exitCode;
    });
  },
});

/** The capability names given to `caplet remove`, each once; at least one is required. */
function removalNames(args: Record<string, unknown>): string[] {
  const positionals = Array.isArray(args._) ? args._ : [args.name];
  const names = [
    ...new Set(
      positionals.filter((value): value is string => typeof value === "string" && value !== ""),
    ),
  ];
  if (names.length === 0) throw validationError("name is required");
  return names;
}
