/** Locked snapshot availability, verified restore selection, and record projection. */
import { lstat } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilityEntry,
  type Diagnostic,
  digestMismatchDiagnostic,
  isErrno,
  type SourceFormat,
} from "@caplet/core";
import { inspectSource } from "./inventory.js";
import type { LockEntry } from "./lockfile.js";
import { type CapabilityRecord, capabilityPath } from "./materialize.js";

/**
 * How restored records differ from the lock entry they must reproduce: the same capability
 * names exactly, and each name's locked payload digest when the entry records one. A name the
 * lock does not record is a mismatch too, since committing it would install a snapshot no lock
 * record verifies.
 */
export function restoreMismatches(locked: LockEntry, restored: CapabilityRecord[]): Diagnostic[] {
  const absent = "no such capability";
  const actual = new Map(
    restored.map((record) => [record.name, record.lockRecord?.payloadDigest ?? "nothing"]),
  );
  const expected = new Map(
    locked.resolvedCapabilities?.map((record) => [record.name, record.payloadDigest]),
  );
  const lockedNames = new Set(locked.capabilityNames);
  const missingOrChanged = locked.capabilityNames.flatMap((name) => {
    const digest = actual.get(name) ?? absent;
    const want = expected.get(name);
    const same = digest !== absent && (want === undefined || want === digest);
    return same
      ? []
      : [digestMismatchDiagnostic(name, "restore", want ?? "a locked capability", digest)];
  });
  const unlocked = restored
    .filter((record) => !lockedNames.has(record.name))
    .map((record) =>
      digestMismatchDiagnostic(record.name, "restore", absent, actual.get(record.name) ?? absent),
    );
  return [...missingOrChanged, ...unlocked];
}

/**
 * The locked capabilities whose snapshot directory is absent, deciding only whether a restore
 * is due and what it installs. Whether a present snapshot still matches its lock is verified
 * where snapshots are read (core `resolveScopeCapabilities`); a modified one is reported there,
 * never silently replaced.
 */
export async function missingSnapshots(
  lockEntry: LockEntry,
  capabilitiesDir: string,
): Promise<Set<string>> {
  const missing = new Set<string>();
  for (const name of lockEntry.capabilityNames) {
    try {
      const stat = await lstat(path.join(capabilitiesDir, name));
      if (!stat.isDirectory()) missing.add(name);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      missing.add(name);
    }
  }
  return missing;
}

/**
 * Present snapshots must still load, even when a legacy lock has no per-capability digest.
 * Do not treat an empty discovery as an intentional removal and sweep its generated outputs.
 * This is separate from restore eligibility: never silently overwrite a damaged present tree.
 */
export async function unusableSnapshots(
  entry: LockEntry,
  capabilitiesDir: string,
): Promise<Set<string>> {
  const unusable = await missingSnapshots(entry, capabilitiesDir);
  for (const name of entry.capabilityNames) {
    if (unusable.has(name)) continue;
    const record = entry.resolvedCapabilities?.find((item) => item.name === name);
    const format = record?.format ?? entry.format ?? (entry.synthesized ? "skills" : "acf");
    const formats = format === "skills" ? (["acf", "skills"] as const) : [format];
    const snapshot = capabilityPath(capabilitiesDir, name);
    try {
      for (const snapshotFormat of formats) {
        if (!(await snapshotLoads(snapshot, snapshotFormat, entry, name))) {
          unusable.add(name);
          break;
        }
      }
    } catch {
      // Filesystem failures mean the locked capability cannot safely drive emission.
      unusable.add(name);
    }
  }
  return unusable;
}

/**
 * The records a verified restore commits: the staged snapshot of each capability that is
 * missing, and the installed one of each that is present, so restoring one snapshot never
 * replaces a present sibling, modified or not.
 */
export async function restoreOnlyMissing(
  entry: CapabilityEntry,
  locked: LockEntry,
  staged: CapabilityRecord[],
  capabilitiesDir: string,
): Promise<CapabilityRecord[]> {
  const missing = await missingSnapshots(locked, capabilitiesDir);
  return [
    ...staged.filter((record) => missing.has(record.name)),
    ...recordsFromLock(entry, locked, capabilitiesDir).filter(
      (record) => !missing.has(record.name),
    ),
  ];
}

/** Projects lock identities onto installed paths without reading or changing snapshot bytes. */
export function recordsFromLock(
  entry: CapabilityEntry,
  lockEntry: LockEntry,
  capabilitiesDir: string,
): CapabilityRecord[] {
  return lockEntry.capabilityNames.map((name) => {
    const lockRecord = lockEntry.resolvedCapabilities?.find((record) => record.name === name);
    return {
      entry,
      name,
      selector: lockEntry.selectorsByCapability?.[name] ?? name,
      root: capabilityPath(capabilitiesDir, name),
      commit: lockEntry.resolvedSha ?? null,
      contentHash: lockRecord?.capabilityHash ?? lockEntry.capabilityHash,
      lockRecord,
    };
  });
}

/** A locked snapshot must load as an individual package, never as a collection of nested examples. */
async function snapshotLoads(
  snapshot: string,
  format: SourceFormat,
  entry: LockEntry,
  name: string,
): Promise<boolean> {
  const inventory = await inspectSource(snapshot, {
    format,
    rename: name,
    revision: entry.resolvedSha,
  });
  return (
    inventory.candidates.length > 0 &&
    (format !== "acf" || inventory.candidates.some((item) => item.root === snapshot)) &&
    !inventory.diagnostics.some((item) => item.severity === "error")
  );
}
