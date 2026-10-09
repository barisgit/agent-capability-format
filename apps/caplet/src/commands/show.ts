import {
  type AcfCapability,
  applyApplicability,
  type ComponentOutcome,
  type Diagnostic,
  hookEntries,
  resolveScopeCapabilities,
  type TargetId,
  targetIds,
} from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { readCwd, readScope, validationError } from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { buildEmitPlan } from "../internal/emit-plan.js";
import { printJson, readJson } from "../internal/json.js";
import { exitCodeForDiagnostics, finishWithDiagnostics, reporter } from "../internal/output.js";
import { columns, displayVersion } from "../internal/render.js";
import { resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";

export const showCommand = defineCommand({
  meta: { name: "show", description: "show a capability's contents and target support" },
  args: specToCittyArgs("show") as ArgsDef,
  async run(context) {
    await runCommandSafely("show", context.args, async () => {
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
      // Support comes from the compatibility outcomes a plan for every target reports.
      const outcomes =
        matches.length === 0
          ? []
          : (await buildEmitPlan({ ...context.args, target: [...targetIds] })).outcomes;
      if (readJson(context.args)) {
        const code = exitCodeForDiagnostics(diagnostics, context.args);
        const payload = matches.map((match) => ({
          scope: match.scope,
          ...capabilitySummary(match.capability),
          support: Object.fromEntries(
            targetIds.map((target) => [
              target,
              supportLevel(outcomes, match.capability.manifest.name, target),
            ]),
          ),
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
          `${colors.bold(capability.manifest.name)} ${displayVersion(capability.manifest.version)}${
            capability.synthesized === true ? colors.dim(" · unmanifested import") : ""
          }`,
        );
        out.log(colors.dim(`  ${match.scope} scope \u00b7 ${capability.root}`));
        out.log("");
        const rows = Object.entries(facetNames(capability))
          .filter(([, names]) => names.length > 0)
          .map(([family, names]) => [`  ${colors.dim(family)}`, names.join(", ")]);
        for (const line of columns(rows)) out.log(line);
        out.log("");
        const head = ["  TARGET", ...targetIds].map((cell) => colors.dim(cell));
        const support = [
          "  supported",
          ...targetIds.map((targetId) => {
            const level = supportLevel(outcomes, capability.manifest.name, targetId);
            return level === "yes" ? level : colors.yellow(level);
          }),
        ];
        for (const line of columns([head, support])) out.log(line);
      }
    });
  },
});

/** The `show --json` description of a capability, before its scope and support. */
function capabilitySummary(capability: AcfCapability) {
  return {
    name: capability.manifest.name,
    version: capability.manifest.version,
    synthesized: capability.synthesized === true,
    root: capability.root,
    facets: facetNames(capability),
    applicability: Object.fromEntries(
      targetIds.map((targetId) => [targetId, applyApplicability(capability, targetId) !== null]),
    ),
    diagnostics: capability.diagnostics,
  };
}

/** The names a capability declares in each facet family, in display order. */
function facetNames(capability: AcfCapability): Record<string, string[]> {
  return {
    skills: capability.skills.map((facet) => facet.name),
    agents: capability.agents.map((facet) => facet.name),
    commands: capability.commands.map((facet) => facet.name),
    instructions: capability.instructions.map((facet) => facet.name),
    hooks: hookEvents(capability),
    // Servers for different targets may share a name (SPEC.md §13a.5).
    mcp: [...new Set(capability.mcp?.servers.map((server) => server.name))],
  };
}

/**
 * The hook events a capability declares, in file order: canonical hook types, then each
 * target-native event as `<target>:<event>` (SPEC.md §13.9).
 */
function hookEvents(capability: AcfCapability): string[] {
  const events = hookEntries(capability.hooks).map(({ event, target }) =>
    target === undefined ? event : `${target}:${event}`,
  );
  return [...new Set(events)];
}

/**
 * How fully `target` carries capability `name`, from the plan's compatibility outcomes: `no` when
 * it installs none of it (not applicable or planned there, blocked, or every component omitted),
 * `partial` when a component is omitted or changes behavior, and `yes` otherwise.
 */
function supportLevel(
  outcomes: readonly ComponentOutcome[],
  name: string,
  target: TargetId,
): "yes" | "partial" | "no" {
  const own = outcomes.filter((item) => item.capability === name && item.target === target);
  if (own.some((item) => item.outcome === "blocked")) return "no";
  const components = own.filter((item) => item.family !== "package");
  if (components.every((item) => item.outcome === "omitted")) return "no";
  const lossy = components.some(
    (item) => item.outcome === "omitted" || item.outcome === "changed-behavior",
  );
  return lossy ? "partial" : "yes";
}
