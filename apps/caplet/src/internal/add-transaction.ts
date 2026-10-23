/** Recoverable installer-state checkpoint for the self-applying `add` command. */
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isErrno, type ScopeRoot } from "@caplet/core";
import { sidecarPath } from "../apply/sidecar.js";
import { readBytesIfExists } from "./fs.js";
import type { ApplicablePlan } from "./workflow.js";

type Checkpoint = { destination: string; backup: string; existed: boolean; ownership: boolean };

/**
 * Restores prior snapshots, lock and ownership when `action` throws or reports failure.
 * Native output bytes and host registration are not journaled; callers validate the complete plan
 * before entering this checkpoint. This is recovery within one process, not crash recovery.
 */
export async function withInstallerRollback(
  root: ScopeRoot,
  action: () => Promise<boolean>,
  plan: ApplicablePlan,
): Promise<void> {
  await mkdir(root.agentsDir, { recursive: true });
  const backupDir = await mkdtemp(path.join(root.agentsDir, ".acf-add-rollback-"));
  const checkpoints: Checkpoint[] = [];
  const ownershipPaths = [
    ...new Set([
      ...plan.diffs.map((item) => item.installRoot),
      ...plan.staleEntries.map((item) => item.installRoot),
      ...plan.claude.map((item) => item.installRoot),
    ]),
  ].map(sidecarPath);
  let started = false;
  let succeeded = false;
  try {
    for (const [name, destination] of [
      ["capabilities", root.capabilitiesDir],
      ["lock", root.lockPath],
      ...ownershipPaths.map((destination, index) => [`ownership-${index}`, destination] as const),
    ] as const) {
      const backup = path.join(backupDir, name);
      let existed = true;
      const ownership = ownershipPaths.includes(destination);
      try {
        await cp(destination, backup, {
          recursive: true,
          preserveTimestamps: true,
          dereference: ownership,
        });
      } catch (error) {
        if (!isErrno(error, "ENOENT")) throw error;
        existed = false;
      }
      checkpoints.push({ destination, backup, existed, ownership });
    }
    started = true;
    succeeded = await action();
  } finally {
    if (started && !succeeded) await restoreCheckpoints(checkpoints, backupDir);
    await rm(backupDir, { recursive: true, force: true });
  }
}

/** Restores via a sibling temporary file: output roots may live on another filesystem. */
async function restoreOwnership(checkpoint: Checkpoint): Promise<void> {
  let temporary: string;
  try {
    temporary = await mkdtemp(
      path.join(path.dirname(checkpoint.destination), ".acf-ownership-rollback-"),
    );
  } catch (error) {
    if (!isErrno(error, "EACCES")) throw error;
    // Emission can overwrite a writable sidecar in a read-only directory. No sibling
    // replacement is possible there; restore through that same file without unlinking it.
    await writeFile(checkpoint.destination, await readFile(checkpoint.backup));
    return;
  }
  try {
    const replacement = path.join(temporary, "sidecar");
    await cp(checkpoint.backup, replacement, { preserveTimestamps: true });
    // Keep the current sidecar intact until its replacement is ready on the same filesystem.
    await rename(replacement, checkpoint.destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Leaves backups intact when recovery itself fails, naming them in the propagated error. */
async function restoreCheckpoints(checkpoints: Checkpoint[], backupDir: string): Promise<void> {
  const failures: unknown[] = [];
  for (const checkpoint of checkpoints) {
    try {
      await restoreCheckpoint(checkpoint);
    } catch (error) {
      // A broken root must not prevent other roots from relinquishing adoptions.
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `installer rollback failed; recover backups from ${backupDir}`,
    );
  }
}

/** Skips unchanged sidecars and otherwise restores one destination without affecting later roots. */
async function restoreCheckpoint(checkpoint: Checkpoint): Promise<void> {
  if (checkpoint.ownership) {
    const before = checkpoint.existed ? await readFile(checkpoint.backup) : null;
    const current = await readBytesIfExists(checkpoint.destination);
    // A failed write may leave an unchanged sidecar in an unwritable root.
    if (before === null ? current === null : current !== null && before.equals(current)) return;
    if (checkpoint.existed) {
      await restoreOwnership(checkpoint);
      return;
    }
  }
  await rm(checkpoint.destination, { recursive: true, force: true });
  if (checkpoint.existed) await rename(checkpoint.backup, checkpoint.destination);
}
