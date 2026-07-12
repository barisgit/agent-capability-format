import { type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { detectLockDrift, readCapabilitiesYml, readLockfile } from "@acf/installer";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";
import { specToCittyArgs } from "../internal/spec";
import { buildEmitPlan } from "../internal/workflow";

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "validate manifests and detect stale outputs (CI-friendly)",
  },
  args: specToCittyArgs("check") as ArgsDef,
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
      const json = readJson(context.args);
      const out = reporter(context.args);
      const allDiagnostics = [...diagnostics, ...lockDiagnostics];
      if (!json) printDiagnostics(allDiagnostics, context.args);
      const finish = (code: 0 | 1 | 2 | 3, result: string, pending: number, message?: string) => {
        if (json) {
          printJson("check", code === 0, allDiagnostics, {
            result,
            pending,
            capabilities: capabilityCount,
            scopes: scopeRoots.map((scopeRoot) => scopeRoot.scope),
          });
        } else if (message !== undefined) {
          if (code === 0) out.done(message);
          else out.failure(message);
        }
        process.exitCode = code;
      };
      const invalid = exitCodeForDiagnostics(diagnostics, context.args);
      if (invalid !== 0) {
        finish(invalid === 4 ? 2 : invalid, "invalid", 0, "Validation failed");
        return;
      }
      if (context.args.frozen === true && lockDiagnostics.some((d) => d.severity !== "info")) {
        finish(3, "lock-stale", 0, "Lockfile is stale - run caplet update and commit the result");
        return;
      }
      const plan = await buildEmitPlan(context.args);
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
      finish(0, "clean", 0, "Validation passed");
      if (!json) {
        out.details([
          ["Capabilities", capabilityCount],
          ["Scopes", scopeRoots.map((scopeRoot) => scopeRoot.scope).join(", ")],
        ]);
      }
    });
  },
});
