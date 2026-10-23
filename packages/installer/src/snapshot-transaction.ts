/** Ownership checks and recoverable commits for the host-independent snapshot tree. */
import { lstat, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { computePayloadDigest, type Diagnostic, isErrno } from "@caplet/core";
import type { CapabilitiesLock } from "./lockfile.js";
import { type CapabilityRecord, capabilityPath } from "./materialize.js";

/**
 * Commits staged records and stale removals, then the atomic lock replacement. Retained
 * records pass through; a failed write restores snapshots. If recovery itself fails, backups
 * survive outside staging and the error names their directory for manual recovery.
 */
export async function commitStagedRecords(
  records: CapabilityRecord[],
  stagingDir: string,
  capabilitiesDir: string,
  stale: readonly string[],
  commitLock: () => Promise<void>,
): Promise<CapabilityRecord[]> {
  const committed: CapabilityRecord[] = [];
  const changes: Array<{ destination: string; backup: string; existed: boolean }> = [];
  const backupDir = await mkdtemp(path.join(path.dirname(stagingDir), ".acf-rollback-"));
  let settled = false;
  const reserve = async (name: string) => {
    const destination = capabilityPath(capabilitiesDir, name);
    const change = { destination, backup: path.join(backupDir, name), existed: false };
    try {
      await rename(destination, change.backup);
      change.existed = true;
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
    changes.push(change);
    return destination;
  };
  try {
    for (const record of records) {
      const relative = path.relative(stagingDir, record.root);
      if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
        committed.push(record);
        continue;
      }
      const destination = await reserve(record.name);
      await rename(record.root, destination);
      committed.push({ ...record, root: destination });
    }
    for (const name of new Set(stale)) await reserve(name);
    // Atomic lock replacement is last; earlier failures can restore every snapshot.
    await commitLock();
    settled = true;
    return committed;
  } catch (error) {
    try {
      for (const change of changes.reverse()) {
        await rm(change.destination, { recursive: true, force: true });
        if (change.existed) await rename(change.backup, change.destination);
      }
      settled = true;
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `snapshot rollback failed; recover backups from ${backupDir}`,
      );
    }
    throw error;
  } finally {
    if (settled) await rm(backupDir, { recursive: true, force: true });
  }
}

/** Refuses a staged snapshot's destination unless the prior lock owns it or bytes agree. */
export async function unownedSnapshotDiagnostics(
  records: CapabilityRecord[],
  previous: CapabilitiesLock | null,
  capabilitiesDir: string,
): Promise<Diagnostic[]> {
  const owned = new Set(previous?.entries.flatMap((entry) => entry.capabilityNames) ?? []);
  const diagnostics: Diagnostic[] = [];
  for (const record of records) {
    const destination = capabilityPath(capabilitiesDir, record.name);
    if (owned.has(record.name) || record.root === destination) continue;
    try {
      await lstat(destination);
    } catch (error) {
      if (isErrno(error, "ENOENT")) continue;
      throw error;
    }
    // A malformed tree is not adoptable. Digesting also rejects links and special files.
    let identical = false;
    try {
      identical =
        (await computePayloadDigest(destination)) === (await computePayloadDigest(record.root));
    } catch {
      identical = false;
    }
    if (!identical)
      diagnostics.push({
        severity: "error",
        code: "acf.apply.unowned",
        path: destination,
        capability: { name: record.name },
        message: `refusing to replace unowned capability directory ${destination}; move or delete it, then retry (or restore its lock record from backup)`,
      });
  }
  return diagnostics;
}
