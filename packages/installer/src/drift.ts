import type { CapabilitiesYml, Diagnostic } from "@acf/core";
import type { CapabilitiesLock } from "./lockfile";
import { entrySourceId, sourceId } from "./lockfile";

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
  }
  return diagnostics;
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
