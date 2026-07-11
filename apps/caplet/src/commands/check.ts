import { type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { detectLockDrift, readCapabilitiesYml, readLockfile } from "@acf/installer";
import { defineCommand } from "citty";
import { globalArgs, readCwd, readScope, targetArg } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";
import { buildEmitPlan } from "../internal/workflow";

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "validate manifests and detect stale outputs (CI-friendly)",
  },
  args: {
    ...globalArgs,
    ...targetArg,
    frozen: {
      type: "boolean",
      default: false,
      description: "also fail (exit 3) if the lockfile is stale",
    },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const diagnostics: Diagnostic[] = [];
      const lockDiagnostics: Diagnostic[] = [];
      const scopeRoots = await resolveScopeRoots(readScope(context.args), cwd);
      let capabilityCount = 0;
      for (const scopeRoot of scopeRoots) {
        const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
        diagnostics.push(...manifest.diagnostics);
        const lock = await readLockfile(scopeRoot.lockPath);
        lockDiagnostics.push(...detectLockDrift(manifest.value, lock));
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        capabilityCount += resolved.capabilities.length;
        for (const capability of resolved.capabilities) diagnostics.push(...capability.diagnostics);
      }
      const out = reporter(context.args);
      printDiagnostics([...diagnostics, ...lockDiagnostics], context.args);
      const invalid = exitCodeForDiagnostics(diagnostics, context.args);
      if (invalid !== 0) {
        out.failure("Validation failed");
        process.exitCode = invalid;
        return;
      }
      if (context.args.frozen === true && lockDiagnostics.some((d) => d.severity !== "info")) {
        out.failure("Lockfile is stale - run caplet update and commit the result");
        process.exitCode = 3;
        return;
      }
      const plan = await buildEmitPlan(context.args);
      const pending = plan.diffs.length;
      if (pending > 0) {
        out.failure(
          `Outputs are stale - ${pending} ${pending === 1 ? "file" : "files"} pending. Run caplet apply.`,
        );
        process.exitCode = 1;
        return;
      }
      out.done("Validation passed");
      out.details([
        ["Capabilities", capabilityCount],
        ["Scopes", scopeRoots.map((scopeRoot) => scopeRoot.scope).join(", ")],
      ]);
    });
  },
});
