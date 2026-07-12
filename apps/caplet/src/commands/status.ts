import { type Diagnostic, resolveScopeCapabilities } from "@acf/core";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { readCwd, readScope, readVerbose } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { printDiagnostics, reporter } from "../internal/output";
import {
  buildPlanView,
  displayPath,
  footprintLines,
  footprintToJson,
  reachToJson,
  shortenSource,
} from "../internal/plan-view";
import { columns } from "../internal/render";
import { resolveScopeRoots } from "../internal/scopes";
import { specToCittyArgs } from "../internal/spec";
import { buildEmitPlan, collectFootprint, collectReach } from "../internal/workflow";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "summarize scopes, capabilities, and pending changes" },
  args: specToCittyArgs("status") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const json = readJson(context.args);
      const out = reporter(context.args);
      const diagnostics: Diagnostic[] = [];
      const scopes = await resolveScopeRoots(readScope(context.args), cwd);
      const capabilityNames = new Map<string, string[]>();
      for (const scopeRoot of scopes) {
        const resolved = await resolveScopeCapabilities(scopeRoot);
        diagnostics.push(...resolved.diagnostics);
        capabilityNames.set(
          scopeRoot.scope,
          resolved.capabilities.map((capability) => capability.manifest.name).sort(),
        );
      }
      const plan = await buildEmitPlan(context.args);
      const reach = await collectReach(plan);
      const verbose = readVerbose(context.args);
      const footprint = verbose ? await collectFootprint(plan) : null;
      if (!json) printDiagnostics([...diagnostics, ...plan.diagnostics], context.args);
      const view = buildPlanView(plan.diffs);
      if (json) {
        printJson("status", true, [...diagnostics, ...plan.diagnostics], {
          pending: view.fileCount,
          ...reachToJson(reach),
          ...(footprint === null ? {} : { footprint: footprintToJson(footprint) }),
        });
        return;
      }
      let first = true;
      for (const scopeRoot of scopes) {
        if (!first) out.log("");
        first = false;
        const names = capabilityNames.get(scopeRoot.scope) ?? [];
        out.log(`${colors.bold(scopeRoot.scope)}  ${colors.dim(displayPath(scopeRoot.agentsDir))}`);
        if (names.length === 0) {
          out.log(`  ${colors.dim("none — caplet add <source>")}`);
          continue;
        }
        const sources = reach.sources.filter((item) => item.scope === scopeRoot.scope);
        const targets = reach.targets.filter((item) => item.scope === scopeRoot.scope);
        const rows: string[][] = [[colors.dim("capabilities"), summarizeNames(names)]];
        for (const item of sources) rows.push([colors.dim("from"), shortenSource(item.source)]);
        if (targets.length > 0 && footprint === null) {
          rows.push([
            colors.dim("writes to"),
            targets
              .map((item) => `${item.destination} ${colors.dim(displayPath(item.installRoot))}`)
              .join(" · "),
          ]);
        }
        for (const line of columns(rows, { indent: "  " })) out.log(line);
        if (footprint !== null) {
          const scoped = footprint.filter((entry) => entry.scope === scopeRoot.scope);
          for (const line of footprintLines(scoped, { skipScopeHeader: true })) out.log(line);
        }
      }
      out.log("");
      if (view.fileCount === 0) {
        out.done("Everything up to date");
        return;
      }
      out.pending(`${view.fileCount} ${view.fileCount === 1 ? "change" : "changes"} pending`);
      out.hint("Preview: caplet apply -n · apply: caplet apply");
    });
  },
});

function summarizeNames(names: readonly string[]): string {
  const shown = names.slice(0, 4);
  const more = names.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` +${more} more` : "");
}
