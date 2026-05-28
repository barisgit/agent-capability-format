import type { CapabilitiesYml, Diagnostic } from "@acf/core";
import type { CapabilitiesLock } from "./lockfile";
import { sourceId } from "./lockfile";

export function detectLockDrift(yml: CapabilitiesYml, lock: CapabilitiesLock | null): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (lock === null) {
    for (const entry of yml.capabilities) {
      diagnostics.push(missingEntryDiagnostic(sourceId(entry.source)));
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
    const id = sourceId(entry.source);
    const lockEntry = entriesBySource.get(id);
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
  }
  return diagnostics;
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
