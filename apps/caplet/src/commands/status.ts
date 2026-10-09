import { type Diagnostic, resolveScopeCapabilities } from "@caplet/core";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { claudeJson, printClaude } from "../internal/apply-flow.js";
import { readCwd, readScope, readVerbose } from "../internal/args.js";
import { previewClaude } from "../internal/claude-host-flow.js";
import { runCommandSafely } from "../internal/command.js";
import { printJson, readJson } from "../internal/json.js";
import { printDiagnostics, reporter } from "../internal/output.js";
import {
  buildPlanView,
  displayPath,
  footprintLines,
  footprintToJson,
  reachToJson,
  shortenSource,
} from "../internal/plan-view.js";
import { columns } from "../internal/render.js";
import { resolveScopeRoots } from "../internal/scopes.js";
import { specToCittyArgs } from "../internal/spec.js";
import { buildEmitPlan, collectFootprint, collectReach } from "../internal/workflow.js";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "summarize scopes, capabilities, and pending changes" },
  args: specToCittyArgs("status") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const json = readJson(context.args);
      const out = reporter(context.args);
      const scopes = await resolveScopeRoots(readScope(context.args), cwd);
      const capabilityNames = new Map<string, string[]>();
      for (const scopeRoot of scopes) {
        // The plan resolves each scope again and reports its diagnostics.
        const resolved = await resolveScopeCapabilities(scopeRoot);
        capabilityNames.set(
          scopeRoot.scope,
          resolved.capabilities.map((capability) => capability.manifest.name).sort(),
        );
      }
      const plan = await buildEmitPlan(context.args);
      const reach = await collectReach(plan);
      const verbose = readVerbose(context.args);
      const footprint = verbose ? await collectFootprint(plan) : null;
      const claude = await previewClaude(plan);
      const diagnostics: Diagnostic[] = [...plan.diagnostics, ...(claude?.diagnostics ?? [])];
      if (!json) printDiagnostics(diagnostics, context.args);
      const view = buildPlanView(plan.diffs);
      if (json) {
        printJson("status", true, diagnostics, {
          pending: view.fileCount,
          ...reachToJson(reach),
          ...(footprint === null ? {} : { footprint: footprintToJson(footprint) }),
          ...claudeJson(claude),
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
      printClaude(out, claude, "planned");
      if (view.fileCount === 0) {
        out.log("");
        out.done("Everything up to date");
        return;
      }
      // pending() starts with its own blank line.
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
