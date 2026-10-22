/**
 * Selects installed snapshots for emission, reconciling manifest intent with disk or preview locks.
 */
import path from "node:path";
import {
  type AcfCapability,
  type CapabilityEntry,
  type Diagnostic,
  resolveScopeCapabilities,
  type ScopeRoot,
} from "@caplet/core";
import {
  type CapabilitiesLock,
  detectLockDrift,
  entrySourceId,
  readCapabilitiesYml,
  readLockfile,
  sourceString,
} from "@caplet/installer";

/** A resolution to plan against instead of the one on disk, keyed by scope (previews). */
export type PlanOverrides = {
  locks?: ReadonlyMap<string, CapabilitiesLock>;
  /** Per-scope snapshot directories standing in for `capabilitiesDir`. */
  capabilitiesDirs?: ReadonlyMap<string, string>;
};

/**
 * The capabilities planned for one scope, adding to `diagnostics` the scope's manifest, lock-drift
 * and discovery diagnostics and each planned capability's own diagnostics.
 */
export async function plannedCapabilities(
  scopeRoot: ScopeRoot,
  diagnostics: Diagnostic[],
  overrides: PlanOverrides | undefined,
): Promise<AcfCapability[]> {
  const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
  diagnostics.push(...manifest.diagnostics);
  const diskLock = await readLockfile(scopeRoot.lockPath);
  const lock = overrides?.locks?.get(scopeRoot.scope) ?? diskLock;
  // Sources are relative to the manifest directory, not the process cwd.
  const manifestDir = path.dirname(scopeRoot.manifestPath);
  diagnostics.push(...detectLockDrift(manifest.value, lock, manifestDir));
  const capabilitiesDir = overrides?.capabilitiesDirs?.get(scopeRoot.scope);
  const resolved = await resolveScopeCapabilities(
    capabilitiesDir === undefined ? scopeRoot : { ...scopeRoot, capabilitiesDir },
    { lock },
  );
  diagnostics.push(...resolved.diagnostics);
  const capabilities =
    lock === null
      ? resolved.capabilities
      : resolved.capabilities.filter(
          manifestSelects(manifest.value.capabilities, manifestDir, lock, diskLock ?? lock),
        );
  // Each planned capability's own diagnostics reach the plan (SPEC.md §14.2): its errors gate
  // apply and its warnings are shown. Discovery diagnostics are the same objects on the scope
  // and on every capability it found, so each object is reported once.
  const reported = new Set(diagnostics);
  for (const capability of capabilities) {
    for (const item of capability.diagnostics) {
      if (reported.has(item)) continue;
      reported.add(item);
      diagnostics.push(item);
    }
  }
  return capabilities;
}

/**
 * Whether the manifest still selects a resolved capability: the source of a `lock` entry naming
 * it is listed in the manifest (in any form of its source id), or no entry of `installedLock` names
 * it. A capability whose source left the manifest is not planned, so the sweep removes its output.
 */
function manifestSelects(
  entries: readonly CapabilityEntry[],
  manifestDir: string,
  lock: CapabilitiesLock,
  installedLock: CapabilitiesLock,
): (capability: AcfCapability) => boolean {
  const manifestSources = new Set(
    entries.flatMap((entry) => [
      entrySourceId(entry),
      entrySourceId(entry, manifestDir),
      sourceString(entry.source),
      sourceString(entry.source, manifestDir),
    ]),
  );
  const selected = new Set(
    lock.entries
      .filter((entry) => manifestSources.has(entry.sourceId))
      .flatMap((entry) => entry.capabilityNames),
  );
  const lockedNames = new Set(installedLock.entries.flatMap((entry) => entry.capabilityNames));
  return (capability) =>
    selected.has(capability.manifest.name) || !lockedNames.has(capability.manifest.name);
}
