import {
  type AcfCapability,
  type Diagnostic,
  resolveScopeCapabilities,
  targetIds,
} from "@acf/core";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { readCwd, readScope, validationError } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { exitCodeForDiagnostics, finishWithDiagnostics, reporter } from "../internal/output";
import { columns } from "../internal/render";
import { resolveScopeRoots } from "../internal/scopes";
import { specToCittyArgs } from "../internal/spec";
import { capabilitySummary } from "../internal/workflow";

export const showCommand = defineCommand({
  meta: { name: "show", description: "show a capability's contents and target support" },
  args: specToCittyArgs("show") as ArgsDef,
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
      if (readJson(context.args)) {
        const code = exitCodeForDiagnostics(diagnostics, context.args);
        const payload = matches.map((match) => ({
          scope: match.scope,
          ...(capabilitySummary(match.capability, targetIds) as Record<string, unknown>),
        }));
        printJson("show", code === 0, diagnostics, { capabilities: payload });
        process.exitCode = code;
        return;
      }
      const code = finishWithDiagnostics(diagnostics, context.args);
      if (code !== 0) return;
      const out = reporter(context.args);
      for (const match of matches) {
        const capability = match.capability;
        out.log(
          `${colors.bold(capability.manifest.name)} ${capability.manifest.version}${
            capability.synthesized === true ? colors.dim(" · unmanifested import") : ""
          }`,
        );
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
