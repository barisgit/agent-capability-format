import { defineCommand } from "citty";
import { resolveScopeCapabilities, targetIds, type Diagnostic } from "@acf/core";
import { globalArgs, readCwd, readScope, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";
import { capabilitySummary } from "../internal/workflow";

export const inspectCommand = defineCommand({
  meta: { name: "inspect", description: "print a capability's resolved facets as JSON" },
  args: {
    ...globalArgs,
    name: { type: "positional", required: true, description: "capability name" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = context.args.name;
      if (typeof name !== "string" || name.length === 0) throw validationError("name is required");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const diagnostics: Diagnostic[] = [];
      const matches = [];
      for (const scopeRoot of await resolveScopeRoots(readScope(context.args), cwd)) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        for (const capability of resolved.capabilities) {
          if (capability.manifest.name === name) matches.push(capabilitySummary(capability, targetIds));
        }
      }
      if (matches.length === 0) {
        diagnostics.push({ severity: "error", code: "acf.caplet.not-found", message: `capability not found: ${name}` });
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code === 0) reporter(context.args).log(JSON.stringify(matches.length === 1 ? matches[0] : matches, null, 2));
    });
  },
});
