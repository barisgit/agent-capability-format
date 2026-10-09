import type { CapabilitiesYml, CapabilityEntry, Diagnostic, EntrySelection } from "@caplet/core";
import type { CapabilitiesLock } from "./lockfile.js";
import { entrySourceId, sourceId } from "./lockfile.js";

export function detectLockDrift(yml: CapabilitiesYml, lock: CapabilitiesLock | null): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (lock === null) {
    for (const entry of yml.capabilities) {
      diagnostics.push(missingEntryDiagnostic(entrySourceId(entry)));
    }
    return diagnostics;
  }

  const version = lockVersion(lock);
  if (version !== 1) {
    diagnostics.push({
      severity: "error",
      code: "acf.lock.unsupported-version",
      message: `unsupported capabilities.lock version: ${version}`,
      data: { acf: version },
    });
    return diagnostics;
  }

  const entriesBySource = new Map(lock.entries.map((entry) => [entry.sourceId, entry]));
  for (const entry of yml.capabilities) {
    const id = entrySourceId(entry);
    const lockEntry = entriesBySource.get(id) ?? entriesBySource.get(sourceId(entry.source));
    if (lockEntry === undefined) {
      diagnostics.push(missingEntryDiagnostic(id));
      continue;
    }
    if ((entry.ref ?? null) !== (lockEntry.ref ?? null)) {
      diagnostics.push({
        severity: "error",
        code: "acf.lock.drift",
        message: `capabilities.yml ref differs from lock for ${id}`,
        data: { sourceId: id, ymlRef: entry.ref ?? null, lockRef: lockEntry.ref ?? null },
      });
    }
    if (!sameStrings(entry.capabilities, lockEntry.capabilities)) {
      diagnostics.push({
        severity: "error",
        code: "acf.lock.drift",
        message: `capabilities.yml capability selectors differ from lock for ${id}`,
        data: {
          sourceId: id,
          ymlCapabilities: entry.capabilities ?? null,
          lockCapabilities: lockEntry.capabilities ?? null,
        },
      });
    }
    if (!sameSelection(entry, lockEntry)) {
      diagnostics.push({
        severity: "error",
        code: "acf.lock.drift",
        message: `capabilities.yml include, exclude, only or except differs from lock for ${id}`,
        data: {
          sourceId: id,
          ymlSelection: selectionData(entry),
          lockSelection: selectionData(lockEntry),
        },
      });
    }
  }
  return diagnostics;
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

function lockVersion(lock: CapabilitiesLock): number {
  return (lock as { acf: number }).acf;
}
