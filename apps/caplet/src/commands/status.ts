import { type Diagnostic, resolveScopeCapabilities, type ScopeRoot } from "@caplet/core";
import { readCapabilitiesYml } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { colors } from "consola/utils";
import { claudeJson, printClaude } from "../internal/apply-flow.js";
import { readCwd, readScope, readVerbose } from "../internal/args.js";
import { previewClaude, previewedDiffs } from "../internal/claude-host-flow.js";
import { runCommandSafely } from "../internal/command.js";
import { buildEmitPlan } from "../internal/emit-plan.js";
import { printJson, readJson } from "../internal/json.js";
import {
  exitCodeForDiagnostics,
  printDiagnostics,
  type Reporter,
  reporter,
} from "../internal/output.js";
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
import {
  collectFootprint,
  collectReach,
  type FootprintEntry,
  type Reach,
} from "../internal/workflow.js";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "summarize scopes, capabilities, and pending changes" },
  args: specToCittyArgs("status") as ArgsDef,
  async run(context) {
    await runCommandSafely("status", context.args, async () => {
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const json = readJson(context.args);
      const out = reporter(context.args);
      const scopes = await resolveScopeRoots(readScope(context.args), cwd);
      const inventories = await scopeInventories(scopes);
      const plan = await buildEmitPlan(context.args);
      const reach = await collectReach(plan);
      const footprint = readVerbose(context.args) ? await collectFootprint(plan) : null;
      const claude = await previewClaude(plan);
      const diagnostics: Diagnostic[] = [...plan.diagnostics, ...(claude?.diagnostics ?? [])];
      if (!json) printDiagnostics(diagnostics, context.args);
      const code = exitCodeForDiagnostics(diagnostics, context.args);
      process.exitCode = code;
      const view = buildPlanView(previewedDiffs(plan, claude));
      if (json) {
        printJson("status", code === 0, diagnostics, {
          pending: view.fileCount,
          ...reachToJson(reach),
          ...(footprint === null ? {} : { footprint: footprintToJson(footprint) }),
          ...claudeJson(claude),
        });
        return;
      }
      scopes.forEach((scopeRoot, index) => {
        if (index > 0) out.log("");
        printScope(out, scopeRoot, inventories.get(scopeRoot.scope), reach, footprint);
      });
      printClaude(out, claude, "planned");
      printPending(out, view.fileCount, code);
    });
  },
});

/** The closing line: the pending change count with how to apply it, or that nothing is pending. */
function printPending(out: Reporter, pending: number, code: number): void {
  if (pending === 0) {
    // The diagnostics above explain a non-zero exit; claiming success here would contradict it.
    if (code === 0) {
      out.log("");
      out.done("Everything up to date");
    }
    return;
  }
  // pending() starts with its own blank line.
  out.pending(`${pending} ${pending === 1 ? "change" : "changes"} pending`);
  out.hint("Preview: caplet apply -n · apply: caplet apply");
}

/** A scope's installed capability names, sorted, and the number of sources its manifest lists. */
type ScopeInventory = { names: string[]; listed: number };

async function scopeInventories(
  scopes: readonly ScopeRoot[],
): Promise<Map<string, ScopeInventory>> {
  const inventories = new Map<string, ScopeInventory>();
  for (const scopeRoot of scopes) {
    const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
    // The plan resolves each scope again and reports its diagnostics.
    const resolved = await resolveScopeCapabilities(scopeRoot);
    inventories.set(scopeRoot.scope, {
      names: resolved.capabilities.map((capability) => capability.manifest.name).sort(),
      listed: manifest.value.capabilities.length,
    });
  }
  return inventories;
}

/**
 * Prints one scope's block: its capabilities, their sources and where they are written, or with
 * `--verbose` the scope's footprint in place of the destinations.
 */
function printScope(
  out: Reporter,
  scopeRoot: ScopeRoot,
  inventory: ScopeInventory | undefined,
  reach: Reach,
  footprint: readonly FootprintEntry[] | null,
): void {
  const names = inventory?.names ?? [];
  out.log(`${colors.bold(scopeRoot.scope)}  ${colors.dim(displayPath(scopeRoot.agentsDir))}`);
  if (names.length === 0) {
    // Sources listed in capabilities.yml but never fetched (`caplet add --no-apply`).
    const listed = inventory?.listed ?? 0;
    const hint =
      listed === 0
        ? "none — caplet add <source>"
        : `${listed} ${listed === 1 ? "source" : "sources"} not fetched — caplet apply`;
    out.log(`  ${colors.dim(hint)}`);
    return;
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

function summarizeNames(names: readonly string[]): string {
  const shown = names.slice(0, 4);
  const more = names.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` +${more} more` : "");
}
