import { chmod, copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

/** Why a source entry cannot be part of a snapshot. */
export type SnapshotRejection = "symbolic-link" | "special-file" | "normalization-collision";

/** A source entry that makes a package impossible to snapshot faithfully. */
export class SnapshotRejectedError extends Error {
  constructor(
    /** Path relative to the package root, POSIX separators. */
    readonly relativePath: string,
    readonly reason: SnapshotRejection,
    /** Absolute path of the entry in the source. */
    readonly sourcePath: string,
  ) {
    super(`${describe(reason)} in source package: ${relativePath}`);
    this.name = "SnapshotRejectedError";
  }
}

export type SnapshotOptions = {
  /** Entries to leave out, by package-relative POSIX path, beyond the always-excluded `.git`. */
  exclude?: ((relativePath: string) => boolean) | undefined;
};

/**
 * Copies a package root into `destination` as a complete snapshot (source-format-readers,
 * Preserved source snapshot): every regular file except `.git` entries, including hidden
 * files, with exact bytes and the owner/group/other permission bits. The whole tree is
 * checked before anything is written, so a rejected package leaves `destination` untouched;
 * symbolic links, special files and sibling names that collide after NFC normalization
 * and case folding throw {@link SnapshotRejectedError}. Case collisions are rejected
 * because they cannot coexist on the case-insensitive file systems a lock is restored on.
 */
export async function copySnapshot(
  source: string,
  destination: string,
  options: SnapshotOptions = {},
): Promise<void> {
  const files = await collectFiles(path.resolve(source), "", options);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const target = path.join(destination, ...file.relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file.sourcePath, target);
    // copyFile keeps the mode on POSIX systems; set it explicitly so the bit the digest
    // records cannot depend on the platform's copy semantics.
    await chmod(target, file.mode & 0o777);
  }
}

type SnapshotFile = { relativePath: string; sourcePath: string; mode: number };

async function collectFiles(
  directory: string,
  prefix: string,
  options: SnapshotOptions,
): Promise<SnapshotFile[]> {
  const names = (await readdir(directory)).filter((name) => name !== ".git").sort();
  rejectCollisions(directory, prefix, names);
  const files: SnapshotFile[] = [];
  for (const name of names) {
    const relativePath = joinRelative(prefix, name);
    if (options.exclude?.(relativePath) === true) continue;
    const sourcePath = path.join(directory, name);
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      throw new SnapshotRejectedError(relativePath, "symbolic-link", sourcePath);
    }
    if (stat.isDirectory()) {
      files.push(...(await collectFiles(sourcePath, relativePath, options)));
    } else if (stat.isFile()) {
      files.push({ relativePath, sourcePath, mode: stat.mode });
    } else {
      throw new SnapshotRejectedError(relativePath, "special-file", sourcePath);
    }
  }
  return files;
}

function rejectCollisions(directory: string, prefix: string, names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.normalize("NFC").toLowerCase();
    if (seen.has(key)) {
      throw new SnapshotRejectedError(
        joinRelative(prefix, name),
        "normalization-collision",
        path.join(directory, name),
      );
    }
    seen.add(key);
  }
}

function joinRelative(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

function describe(reason: SnapshotRejection): string {
  switch (reason) {
    case "symbolic-link":
      return "symbolic link";
    case "special-file":
      return "special file";
    case "normalization-collision":
      return "path colliding after NFC and case normalization";
  }
}
