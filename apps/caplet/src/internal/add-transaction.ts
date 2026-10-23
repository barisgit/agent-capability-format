/** Recoverable installer-state checkpoint for the self-applying `add` command. */
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isErrno, type ScopeRoot } from "@caplet/core";

/**
 * Restores the exact prior snapshots and lock when `action` throws or reports failure.
 * Native output and host registration are not journaled; callers validate the complete plan
 * before entering this checkpoint. This is recovery within one process, not crash recovery.
 */
export async function withInstallerRollback(
  root: ScopeRoot,
  action: () => Promise<boolean>,
): Promise<void> {
  await mkdir(root.agentsDir, { recursive: true });
  const backupDir = await mkdtemp(path.join(root.agentsDir, ".acf-add-rollback-"));
  const checkpoints: Array<{ destination: string; backup: string; existed: boolean }> = [];
  let started = false;
  let succeeded = false;
  try {
    for (const [name, destination] of [
      ["capabilities", root.capabilitiesDir],
      ["lock", root.lockPath],
    ] as const) {
      const backup = path.join(backupDir, name);
      let existed = true;
      try {
        await cp(destination, backup, { recursive: true, preserveTimestamps: true });
      } catch (error) {
        if (!isErrno(error, "ENOENT")) throw error;
        existed = false;
      }
      checkpoints.push({ destination, backup, existed });
    }
    started = true;
    succeeded = await action();
  } finally {
    if (started && !succeeded) await restoreCheckpoints(checkpoints, backupDir);
    await rm(backupDir, { recursive: true, force: true });
  }
}

/** Leaves backups intact when recovery itself fails, naming them in the propagated error. */
async function restoreCheckpoints(
  checkpoints: Array<{ destination: string; backup: string; existed: boolean }>,
  backupDir: string,
): Promise<void> {
  try {
    for (const checkpoint of checkpoints) {
      await rm(checkpoint.destination, { recursive: true, force: true });
      if (checkpoint.existed) await rename(checkpoint.backup, checkpoint.destination);
    }
  } catch (error) {
    throw new Error(`installer rollback failed; recover backups from ${backupDir}`, {
      cause: error,
    });
  }
}
