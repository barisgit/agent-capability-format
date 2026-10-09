import type { CapabilitiesYml, CapabilityEntry, Diagnostic, EntrySelection } from "@caplet/core";
import type { CapabilitiesLock, LockEntry } from "./lockfile.js";
import { entrySourceId, lockVersion, sourceId } from "./lockfile.js";

/**
 * Reports how `capabilities.yml` disagrees with the lock: an entry without a lock entry is
 * `acf.lock.missing-entry`, a changed {@link intentChecks intent field} is `acf.lock.drift`,
 * and a lock of another `acf` version is `acf.lock.unsupported-version` (and nothing else).
 * Every diagnostic is an error; callers decide which ones their mode reconciles.
 */
export function detectLockDrift(yml: CapabilitiesYml, lock: CapabilitiesLock | null): Diagnostic[] {
  if (lock === null) {
    return yml.capabilities.map((entry) => missingEntryDiagnostic(entrySourceId(entry)));
  }

  const version = lockVersion(lock);
  if (version !== 1) {
    return [
      {
        severity: "error",
        code: "acf.lock.unsupported-version",
        message: `unsupported capabilities.lock version: ${version}`,
        data: { acf: version },
      },
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const entriesBySource = new Map(lock.entries.map((entry) => [entry.sourceId, entry]));
  for (const entry of yml.capabilities) {
    const id = entrySourceId(entry);
    const lockEntry = entriesBySource.get(id) ?? entriesBySource.get(sourceId(entry.source));
    if (lockEntry === undefined) {
      diagnostics.push(missingEntryDiagnostic(id));
      continue;
    }
    for (const check of intentChecks) {
      if (check.same(entry, lockEntry)) continue;
      diagnostics.push({
        severity: "error",
        code: "acf.lock.drift",
        message: `capabilities.yml ${check.difference} from lock for ${id}`,
        data: { sourceId: id, ...check.data(entry, lockEntry) },
      });
    }
  }
  return diagnostics;
}

/** One `capabilities.yml` field the lock mirrors, compared for drift. */
type IntentCheck = {
  /** Message fragment completing "capabilities.yml ... from lock". */
  difference: string;
  /** Part of the resolution: a difference means the locked snapshots no longer apply. */
  resolution: boolean;
  same(entry: CapabilityEntry, locked: LockEntry): boolean;
  /** Both sides for the diagnostic's `data`, as `yml<Field>` and `lock<Field>`. */
  data(entry: CapabilityEntry, locked: LockEntry): Record<string, unknown>;
};

/**
 * Every entry field the lock records as intent, in reporting order. Drift detection reports
 * each one, and {@link sameResolution} compares those marked `resolution`, so a new field
 * cannot be refetched on without also being reported as drift.
 */
const intentChecks: readonly IntentCheck[] = [
  {
    difference: "ref differs",
    resolution: true,
    same: (entry, locked) => (entry.ref ?? null) === (locked.ref ?? null),
    data: (entry, locked) => ({ ymlRef: entry.ref ?? null, lockRef: locked.ref ?? null }),
  },
  {
    difference: "capability selectors differ",
    resolution: true,
    same: (entry, locked) => sameStrings(entry.capabilities, locked.capabilities),
    data: (entry, locked) => ({
      ymlCapabilities: entry.capabilities ?? null,
      lockCapabilities: locked.capabilities ?? null,
    }),
  },
  {
    difference: "rename differs",
    resolution: true,
    same: (entry, locked) => sameRename(entry.rename, locked.rename),
    data: (entry, locked) => ({
      ymlRename: entry.rename ?? null,
      lockRename: locked.rename ?? null,
    }),
  },
  {
    difference: "format differs",
    resolution: true,
    same: (entry, locked) => (entry.format ?? null) === (locked.format ?? null),
    data: (entry, locked) => ({
      ymlFormat: entry.format ?? null,
      lockFormat: locked.format ?? null,
    }),
  },
  {
    difference: "include, exclude, only or except differs",
    resolution: false,
    same: (entry, locked) => sameSelection(entry, locked),
    data: (entry, locked) => ({
      ymlSelection: selectionData(entry),
      lockSelection: selectionData(locked),
    }),
  },
];

/**
 * Whether `locked` was resolved from what `entry` now asks for: the same `ref`, capability
 * selectors, `rename` and requested `format`. Source and `path` are part of the source id
 * that paired them. When this is false the locked snapshots no longer apply and the entry
 * must be fetched again; selection is not part of it (see {@link sameSelection}).
 */
export function sameResolution(entry: CapabilityEntry, locked: LockEntry): boolean {
  return intentChecks.every((check) => !check.resolution || check.same(entry, locked));
}

/** Whether two entries select the same components and targets, ignoring list order. */
export function sameSelection(left: EntrySelection, right: EntrySelection): boolean {
  return (
    selectorKey(left.include) === selectorKey(right.include) &&
    selectorKey(left.exclude) === selectorKey(right.exclude) &&
    sameStrings(left.only, right.only) &&
    sameStrings(left.except, right.except)
  );
}

function selectionData(selection: EntrySelection): Record<keyof EntrySelection, unknown> {
  return {
    include: selection.include ?? null,
    exclude: selection.exclude ?? null,
    only: selection.only ?? null,
    except: selection.except ?? null,
  };
}

function selectorKey(selector: CapabilityEntry["include"]): string {
  if (selector === undefined) return "";
  return JSON.stringify(
    Object.entries(selector)
      .filter((pair): pair is [string, string[]] => pair[1] !== undefined)
      .map(([family, names]) => [family, [...names].sort()])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}

function sameRename(left: CapabilityEntry["rename"], right: CapabilityEntry["rename"]): boolean {
  if (typeof left !== "object" || typeof right !== "object") return left === right;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function sameStrings(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

function missingEntryDiagnostic(sourceIdValue: string): Diagnostic {
  return {
    severity: "error",
    code: "acf.lock.missing-entry",
    message: `capabilities.lock is missing ${sourceIdValue}`,
    data: { sourceId: sourceIdValue },
  };
}
