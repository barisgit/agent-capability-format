import {
  type AcfCapability,
  type Diagnostic,
  resolveScopeCapabilities,
  targetIds,
} from "@acf/core";
import { defineCommand } from "citty";
import { colors } from "consola/utils";
import { globalArgs, readCwd, readScope, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { columns } from "../internal/render";
import { resolveScopeRoots } from "../internal/scopes";
import { capabilitySummary } from "../internal/workflow";

export const showCommand = defineCommand({
  meta: { name: "show", description: "show a capability's contents and target support" },
  args: {
    ...globalArgs,
    name: { type: "positional", required: true, description: "capability name" },
    json: { type: "boolean", default: false, description: "print machine-readable JSON" },
  },
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const name = context.args.name;
      if (typeof name !== "string" || name.length === 0) throw validationError("name is required");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const diagnostics: Diagnostic[] = [];
      const matches: Array<{ scope: string; capability: AcfCapability }> = [];
      for (const scopeRoot of await resolveScopeRoots(readScope(context.args), cwd)) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        for (const capability of resolved.capabilities) {
          if (capability.manifest.name === name)
            matches.push({ scope: scopeRoot.scope, capability });
        }
      }
      if (matches.length === 0) {
        diagnostics.push({
          severity: "error",
          code: "acf.caplet.not-found",
          message: `capability not found: ${name}`,
        });
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code !== 0) return;
      const out = reporter(context.args);
      if (context.args.json === true) {
        const payload = matches.map((match) => capabilitySummary(match.capability, targetIds));
        out.log(JSON.stringify(payload.length === 1 ? payload[0] : payload, null, 2));
        return;
      }
      for (const match of matches) {
        const capability = match.capability;
        out.log(`${colors.bold(capability.manifest.name)} ${capability.manifest.version}`);
        out.log(colors.dim(`  ${match.scope} scope \u00b7 ${capability.root}`));
        out.log("");
        const facets: Array<[string, string[]]> = [
          ["skills", capability.skills.map((facet) => facet.name)],
          ["agents", capability.agents.map((facet) => facet.name)],
          ["commands", capability.commands.map((facet) => facet.name)],
          ["instructions", capability.instructions.map((facet) => facet.name)],
          ["hooks", Object.keys(capability.hooks?.buckets ?? {})],
          ["mcp", capability.mcp?.servers.map((server) => server.name) ?? []],
        ];
        const rows = facets
          .filter(([, names]) => names.length > 0)
          .map(([family, names]) => [`  ${colors.dim(family)}`, names.join(", ")]);
        for (const line of columns(rows)) out.log(line);
        out.log("");
        const { applyApplicability } = await import("@acf/core");
        const head = ["  TARGET", ...targetIds].map((cell) => colors.dim(cell));
        const support = [
          "  supported",
          ...targetIds.map((targetId) =>
            applyApplicability(capability, targetId) !== null ? "yes" : colors.yellow("no"),
          ),
        ];
        for (const line of columns([head, support])) out.log(line);
      }
    });
  },
});
