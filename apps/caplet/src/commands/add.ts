import path from "node:path";
import type { CapabilityEntry, ScopeRoot } from "@caplet/core";
import { fetchCapability, inspectSource, type PrefetchedSource } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { planAndApply } from "../internal/apply-flow.js";
import {
  readCwd,
  readExplicitScope,
  readOptionalString,
  readYes,
  validationError,
} from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { printJson, readJson } from "../internal/json.js";
import {
  addManifestEntry,
  anchorPathSource,
  buildManifestEntry,
  parseAddSource,
  readManifestForMutation,
} from "../internal/manifest.js";
import { exitCodeForDiagnostics, printDiagnostics, reporter } from "../internal/output.js";
import { inferScope, resolveScopeRoots } from "../internal/scopes.js";
import { chooseSourceCapabilities } from "../internal/source-selection.js";
import { specToCittyArgs } from "../internal/spec.js";
import { fetchScopes, installedExecutables } from "../internal/workflow.js";

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
      const json = readJson(context.args);
      const inspection = await inspectForSelection(root, entry, {
        ...(parsedSource.selector === undefined ? {} : { requested: parsedSource.selector }),
        // The picker would write to stdout, which carries only the envelope under --json.
        interactive: !json && process.stdin.isTTY === true && process.stdout.isTTY === true,
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
        process.exitCode = inspectionCode;
        if (json) {
          printJson("add", false, inspection.inventory.diagnostics, {
            added: null,
            plan: null,
            applied: null,
            executables: [],
          });
          return;
        }
        printDiagnostics(inspection.inventory.diagnostics, context.args);
        out.failure("Source inspection failed");
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
      const added = {
        source: parsedSource.source,
        scope,
        manifest: root.manifestPath,
        capabilities: inspection.selected,
        ...(entry.path === undefined ? {} : { path: entry.path }),
      };
      if (!json) {
        out.done(`Added ${entry.source.kind} source (${scope} scope)`);
        out.details([
          ["Manifest", root.manifestPath],
          ["Source", parsedSource.source],
          ["Capabilities", selectionSummary(inspection.selected)],
          ...(entry.path === undefined ? [] : ([["Path", entry.path]] as Array<[string, string]>)),
        ]);
      }
      if (context.args.apply === false) {
        // Nothing is resolved or installed yet; the apply that installs it reports executables.
        if (json) {
          printJson("add", true, inspection.inventory.diagnostics, {
            added,
            plan: null,
            applied: null,
            executables: [],
          });
        } else {
          printDiagnostics(inspection.inventory.diagnostics, context.args);
        }
        return;
      }
      const scopedArgs = { ...context.args, scope };
      const installed = await installedExecutables(scopedArgs);
      const fetched = await fetchScopes(scopedArgs, "auto", undefined, {
        prefetchedSources: new Map([
          [inspection.prefetched.fetched.sourceId, inspection.prefetched],
        ]),
      });
      await planAndApply({
        command: "add",
        args: scopedArgs,
        diagnostics: fetched.diagnostics,
        installed,
        payload: { added },
      });
    });
  },
});
