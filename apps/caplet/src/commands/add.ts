import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilityEntry,
  type Diagnostic,
  isErrno,
  type Scope,
  type ScopeRoot,
} from "@caplet/core";
import { fetchCapability, inspectSource, type PrefetchedSource } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { withInstallerRollback } from "../internal/add-transaction.js";
import { planAndApply } from "../internal/apply-flow.js";
import { outsideRootFailures } from "../internal/apply-plan.js";
import {
  readCwd,
  readExplicitScope,
  readOptionalString,
  readYes,
  validationError,
} from "../internal/args.js";
import { runCommandSafely } from "../internal/command.js";
import { buildEmitPlan } from "../internal/emit-plan.js";
import { fetchScopes, installedExecutables } from "../internal/fetch-scopes.js";
import { printJson, readJson } from "../internal/json.js";
import {
  addManifestEntry,
  anchorPathSource,
  buildManifestEntry,
  parseAddSource,
  readManifestForMutation,
} from "../internal/manifest.js";
import {
  exitCodeForDiagnostics,
  printDiagnostics,
  type Reporter,
  reporter,
} from "../internal/output.js";
import { buildPlanView, planToJson } from "../internal/plan-view.js";
import { inferScope, resolveScopeRoots } from "../internal/scopes.js";
import { chooseSourceCapabilities } from "../internal/source-selection.js";
import { specToCittyArgs } from "../internal/spec.js";
import type { EmitPlan } from "../internal/workflow.js";

export const addCommand = defineCommand({
  meta: { name: "add", description: "add capabilities from a source and apply them" },
  args: specToCittyArgs("add") as ArgsDef,
  async run(context) {
    await runCommandSafely("add", context.args, () => addSource(context.args));
  },
});

/** Adds the source to the scope's manifest, then applies it unless `--no-apply`. */
async function addSource(args: Record<string, unknown>): Promise<void> {
  if (Array.isArray(args._) && args._.length > 1) {
    throw validationError("add takes exactly one source; run add separately for each source");
  }
  const rawSource = args.source;
  if (typeof rawSource !== "string" || rawSource.length === 0)
    throw validationError("source is required");
  const cwd = readCwd(args);
  process.chdir(cwd);
  const scope = await inferScope(readExplicitScope(args), cwd);
  const root = (await resolveScopeRoots(scope, cwd))[0];
  if (root === undefined) throw validationError(`unable to resolve ${scope} scope`);
  const parsedSource = parseAddSource(rawSource);
  const entry = manifestEntry(args, parsedSource.source, cwd);
  const json = readJson(args);
  const inspection = await inspectForSelection(root, entry, {
    ...(parsedSource.selector === undefined ? {} : { requested: parsedSource.selector }),
    // The picker would write to stdout, which carries only the envelope under --json.
    interactive: !json && process.stdin.isTTY === true && process.stdout.isTTY === true,
    yes: readYes(args),
  });
  const out = reporter(args);
  const { selected, inventory } = inspection;
  if (selected === null) {
    out.log("Cancelled — nothing changed");
    process.exitCode = 130;
    return;
  }
  if (exitCodeForDiagnostics(inventory.diagnostics, args) !== 0) {
    reportInspectionFailure(args, out, inventory.diagnostics);
    return;
  }
  if (parsedSource.selector !== undefined || selected.length < inventory.candidates.length) {
    const names = new Set(selected);
    entry.capabilities = inventory.candidates
      .filter((candidate) => names.has(candidate.name))
      .map((candidate) => candidate.selector);
  }
  if (typeof entry.rename === "string" && selected.length !== 1) {
    throw validationError(
      "--as requires exactly one capability; select one capability or use a rename mapping in capabilities.yml",
    );
  }
  const previous = await readFile(root.manifestPath).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  });
  let succeeded = false;
  try {
    await addManifestEntry(root, entry);
    await applyAddedSource(args, root, entry, parsedSource.source, selected, inspection, out);
    succeeded = Number(process.exitCode ?? 0) === 0;
  } finally {
    // Preserve comments, formatting and even absence on every failed add, not a reserialization.
    if (!succeeded) {
      if (previous === null) await rm(root.manifestPath, { force: true });
      else await writeFile(root.manifestPath, previous);
    }
  }
}

/** Resolves and applies the newly declared source, or reports a manifest-only add. */
async function applyAddedSource(
  args: Record<string, unknown>,
  root: ScopeRoot,
  entry: CapabilityEntry,
  source: string,
  selected: string[],
  inspection: SelectionInspection,
  out: Reporter,
): Promise<void> {
  const { scope } = root;
  const { inventory } = inspection;
  const json = readJson(args);
  const added: Added = {
    source,
    scope,
    manifest: root.manifestPath,
    capabilities: selected.map((name) =>
      typeof entry.rename === "string" ? entry.rename : (entry.rename?.[name] ?? name),
    ),
    ...(entry.path === undefined ? {} : { path: entry.path }),
  };
  if (args.apply === false) {
    if (!json) printAdded(out, entry.source.kind, added);
    // Nothing is resolved or installed yet; the apply that installs it reports executables.
    if (json) printJson("add", true, inventory.diagnostics, unappliedEnvelope(added));
    else printDiagnostics(inventory.diagnostics, args);
    return;
  }
  const scopedArgs = { ...args, scope };
  const prefetchedSources = new Map([
    [inspection.prefetched.fetched.sourceId, inspection.prefetched],
  ]);
  const validatedPlan = await validateAddedSource(scopedArgs, prefetchedSources, added, out);
  if (validatedPlan === null) return;
  const installed = await installedExecutables(scopedArgs);
  await withInstallerRollback(
    root,
    async () => {
      const fetched = await fetchScopes(scopedArgs, "auto", undefined, { prefetchedSources });
      await planAndApply({
        command: "add",
        args: scopedArgs,
        diagnostics: fetched.diagnostics,
        installed,
        payload: { added },
      });
      const succeeded = Number(process.exitCode ?? 0) === 0;
      if (succeeded && !json) printAdded(out, entry.source.kind, added);
      return succeeded;
    },
    validatedPlan,
  );
}

/** Rejects resolution, facet and destination conflicts against disposable snapshots before commit. */
async function validateAddedSource(
  args: Record<string, unknown>,
  prefetchedSources: ReadonlyMap<string, PrefetchedSource>,
  added: Added,
  out: Reporter,
): Promise<EmitPlan | null> {
  const fetched = await fetchScopes(args, "auto", undefined, {
    updateLock: false,
    prefetchedSources,
  });
  try {
    const plan = await buildEmitPlan(args, {
      locks: new Map(
        fetched.scopes.flatMap((root, index) => {
          const result = fetched.results[index];
          return result === undefined ? [] : [[root.scope, result.lockfile] as const];
        }),
      ),
      capabilitiesDirs: new Map(
        fetched.scopes.flatMap((root, index) => {
          const preview = fetched.results[index]?.preview;
          return preview === undefined ? [] : [[root.scope, preview.capabilitiesDir] as const];
        }),
      ),
    });
    const diagnostics = [...fetched.diagnostics, ...plan.diagnostics];
    await outsideRootFailures(plan, diagnostics);
    const code = exitCodeForDiagnostics(diagnostics, args);
    if (code === 0) return plan;
    process.exitCode = code;
    const view = buildPlanView(plan.diffs);
    if (readJson(args))
      printJson("add", false, diagnostics, {
        added,
        plan: planToJson(view),
        applied: null,
        outcomes: plan.outcomes,
        executables: [],
      });
    else {
      printDiagnostics(diagnostics, args);
      out.compatibility(plan.outcomes, plan.targets);
      if (plan.diffs.some((item) => item.conflict === true)) out.plan(view);
    }
    return null;
  } finally {
    await Promise.all(fetched.results.map((result) => result.preview?.dispose()));
  }
}

/** The `added` field of the `--json` envelope. */
type Added = {
  source: string;
  scope: Scope;
  manifest: string;
  capabilities: string[];
  path?: string;
};

/** The manifest entry for the source with `--pin`, `--path` and `--as`. */
function manifestEntry(
  args: Record<string, unknown>,
  source: string,
  cwd: string,
): CapabilityEntry {
  const built = buildManifestEntry(source, {
    ref: readOptionalString(args, "pin"),
    path: readOptionalString(args, "path"),
    rename: readOptionalString(args, "as"),
  });
  // A relative path typed on the command line means "relative to --cwd", not to the
  // manifest directory, so anchor it before it is fetched or written.
  return anchorPathSource(built, cwd);
}

/** The `--json` envelope of an add that wrote nothing to the targets. */
function unappliedEnvelope(added: Added | null): Record<string, unknown> {
  return { added, plan: null, applied: null, executables: [] };
}

/** Reports a source whose inspection failed; the manifest is left unchanged. */
function reportInspectionFailure(
  args: Record<string, unknown>,
  out: Reporter,
  diagnostics: readonly Diagnostic[],
): void {
  process.exitCode = exitCodeForDiagnostics(diagnostics, args);
  if (readJson(args)) {
    printJson("add", false, diagnostics, unappliedEnvelope(null));
    return;
  }
  printDiagnostics(diagnostics, args);
  out.failure("Source inspection failed");
}

function printAdded(out: Reporter, kind: CapabilityEntry["source"]["kind"], added: Added): void {
  out.done(`Added ${kind} source (${added.scope} scope)`);
  out.details([
    ["Manifest", added.manifest],
    ["Source", added.source],
    ["Capabilities", selectionSummary(added.capabilities)],
    ...(added.path === undefined ? [] : ([["Path", added.path]] as Array<[string, string]>)),
  ]);
}

/** A fetched source's inventory and the capabilities chosen from it (`null`: picker cancelled). */
type SelectionInspection = {
  inventory: Awaited<ReturnType<typeof inspectSource>>;
  prefetched: PrefetchedSource;
  selected: string[] | null;
};

/**
 * Fetches and inspects the source, then chooses its capabilities (`chooseSourceCapabilities`):
 * `requested` names one, else the picker asks, else every candidate is taken. A source whose
 * inspection reports an error selects nothing.
 */
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
  const inventory = await inspectSource(fetched.root, {
    format: entry.format,
    rename: entry.rename,
    revision: fetched.commit,
  });
  if (inventory.diagnostics.some((item) => item.severity === "error")) {
    return { inventory, prefetched: { fetched, inventory }, selected: [] };
  }
  const selected = await chooseSourceCapabilities(
    inventory.candidates.map((candidate) => candidate.name),
    options,
  );
  return { inventory, prefetched: { fetched, inventory }, selected };
}

/** Up to three selected names, then how many more. */
function selectionSummary(selected: readonly string[]): string {
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.slice(0, 3).join(", ")} +${selected.length - 3} more`;
}
