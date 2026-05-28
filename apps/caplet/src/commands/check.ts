import { readLockfile } from "@acf/installer";
import { defineCommand } from "citty";
import { detectLockDrift, readCapabilitiesYml } from "@acf/installer";
import { resolveScopeCapabilities, type Diagnostic } from "@acf/core";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";

export const checkCommand = defineCommand({
  meta: { name: "check", description: "validate capabilities and capabilities.yml" },
  args: globalArgs,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const diagnostics: Diagnostic[] = [];
      for (const scopeRoot of await resolveScopeRoots(readScope(context.args), cwd)) {
        const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
        diagnostics.push(...manifest.diagnostics);
        const lock = await readLockfile(scopeRoot.lockPath);
        diagnostics.push(...detectLockDrift(manifest.value, lock));
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        for (const capability of resolved.capabilities) diagnostics.push(...capability.diagnostics);
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code === 0) reporter(context.args).log("check passed");
    });
  },
});
