import path from "node:path";
import type { CapabilityEntry, ScopeRoot } from "@caplet/core";
import { fetchCapability, inspectSource, type PrefetchedSource } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import {
  readCwd,
  readExplicitScope,
  readOptionalString,
  readVerbose,
  readYes,
  validationError,
} from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import {
  addManifestEntry,
  anchorPathSource,
  buildManifestEntry,
  parseAddSource,
  readManifestForMutation,
} from "../internal/manifest.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output.js";
import { buildPlanView } from "../internal/plan-view.js";
import { inferScope, resolveScopeRoots } from "../internal/scopes.js";
import { chooseSourceCapabilities } from "../internal/source-selection.js";
import { specToCittyArgs } from "../internal/spec.js";
import { applyEmitPlan, buildEmitPlan, fetchScopes } from "../internal/workflow.js";

export const addCommand = defineCommand({
  meta: { name: "add", description: "add capabilities from a source and apply them" },
  args: specToCittyArgs("add") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const rawSource = context.args.source;
      if (typeof rawSource !== "string" || rawSource.length === 0)
        throw validationError("source is required");
      const cwd = readCwd(context.args);
      process.chdir(cwd);
      const scope = await inferScope(readExplicitScope(context.args), cwd);
      const root = (await resolveScopeRoots(scope, cwd))[0];
      if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
      const parsedSource = parseAddSource(rawSource);
      const built = buildManifestEntry(parsedSource.source, {
        ref: readOptionalString(context.args, "pin") ?? readOptionalString(context.args, "ref"),
        path: readOptionalString(context.args, "path"),
        rename:
          readOptionalString(context.args, "as") ?? readOptionalString(context.args, "rename"),
      });
      // A relative path typed on the command line means "relative to --cwd", not to the
      // manifest directory, so anchor it before it is fetched or written.
      const entry = anchorPathSource(built, cwd);

      type SelectionInspection = {
        inventory: Awaited<ReturnType<typeof inspectSource>>;
        prefetched: PrefetchedSource;
        selected: string[] | null;
      };

      async function inspectForSelection(
        root: ScopeRoot,
        entry: CapabilityEntry,
        options: { requested?: string; interactive: boolean; yes: boolean },
      ): Promise<SelectionInspection> {
        // Validate the manifest before fetching so an invalid file aborts with nothing changed.
        const manifest = await readManifestForMutation(root);
        // Omitted settings fall through to fetchCapability's defaults, matching the installer.
        const fetched = await fetchCapability(entry, {
          cacheDir: path.join(root.agentsDir, ".cache", "acf-installer"),
          shallow: manifest.defaults?.fetch?.shallow,
          blobless: manifest.defaults?.fetch?.blobless,
        });
        const inventory = await inspectSource(fetched.root);
        if (inventory.diagnostics.some((item) => item.severity === "error")) {
          return { inventory, prefetched: { fetched, inventory }, selected: [] };
        }
        const selected = await chooseSourceCapabilities(
          inventory.candidates.map((candidate) => candidate.name),
          options,
        );
        return { inventory, prefetched: { fetched, inventory }, selected };
      }

      function selectionSummary(selected: readonly string[]): string {
        if (selected.length <= 3) return selected.join(", ");
        return `${selected.slice(0, 3).join(", ")} +${selected.length - 3} more`;
      }
      const inspection = await inspectForSelection(root, entry, {
        ...(parsedSource.selector === undefined ? {} : { requested: parsedSource.selector }),
        interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
        yes: readYes(context.args),
      });
      const out = reporter(context.args);
      if (inspection.selected === null) {
        out.log("Cancelled — nothing changed");
        process.exitCode = 130;
        return;
      }
      const inspectionCode = exitCodeForDiagnostics(inspection.inventory.diagnostics, context.args);
      if (inspectionCode !== 0) {
        printDiagnostics(inspection.inventory.diagnostics, context.args);
        out.failure("Source inspection failed");
        process.exitCode = inspectionCode;
        return;
      }
      if (
        parsedSource.selector !== undefined ||
        inspection.selected.length < inspection.inventory.candidates.length
      ) {
        const names = new Set(inspection.selected);
        entry.capabilities = inspection.inventory.candidates
          .filter((candidate) => names.has(candidate.name))
          .map((candidate) => candidate.selector);
      }
      await addManifestEntry(root, entry);
      out.done(`Added ${entry.source.kind} source (${scope} scope)`);
      out.details([
        ["Manifest", root.manifestPath],
        ["Source", parsedSource.source],
        ["Capabilities", selectionSummary(inspection.selected)],
        ...(entry.path === undefined ? [] : ([["Path", entry.path]] as Array<[string, string]>)),
      ]);
      if (context.args.apply === false) {
        printDiagnostics(inspection.inventory.diagnostics, context.args);
        return;
      }
      const scopedArgs = { ...context.args, scope };
      const fetched = await fetchScopes(scopedArgs, "auto", undefined, {
        prefetchedSources: new Map([
          [inspection.prefetched.fetched.sourceId, inspection.prefetched],
        ]),
      });
      const plan = await buildEmitPlan(scopedArgs);
      const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
      printDiagnostics(diagnostics, context.args);
      const code = exitCodeForDiagnostics(diagnostics, context.args);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
      const view = buildPlanView(plan.diffs, { verbose: readVerbose(context.args) });
      if (view.fileCount === 0) {
        out.done("Everything up to date");
        return;
      }
      out.log("");
      out.plan(view);
      const applied = await applyEmitPlan(plan);
      const written = applied.results.reduce((sum, item) => sum + item.written.length, 0);
      const deleted = applied.results.reduce((sum, item) => sum + item.deleted.length, 0);
      printDiagnostics(applied.diagnostics, context.args);
      process.exitCode = exitCodeForDiagnostics(applied.diagnostics, context.args);
      out.log("");
      out.done(
        `Applied ${view.fileCount} ${view.fileCount === 1 ? "file" : "files"} (${written} ${written === 1 ? "write" : "writes"}, ${deleted} ${deleted === 1 ? "delete" : "deletes"})`,
      );
    });
  },
});
