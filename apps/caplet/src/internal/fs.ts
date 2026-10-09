import { readdir, readFile, stat } from "node:fs/promises";
import { isErrno, type ReadOnlyFs } from "@caplet/core";

/** The disk as a {@link ReadOnlyFs}: a missing path or a directory reads as `null`. */
export function diskReadOnlyFs(): ReadOnlyFs {
  return {
    exists,
    readMode: readModeIfExists,
    readText: (absPath) => nullOn(readFile(absPath, "utf8"), "ENOENT", "EISDIR"),
    readBytes: (absPath) => nullOn(readFile(absPath), "ENOENT", "EISDIR"),
    async listDir(absPath) {
      try {
        return await readdir(absPath);
      } catch (error) {
        if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) return [];
        throw error;
      }
    },
  };
}

/** The UTF-8 text of `filePath`, or `null` when it does not exist; other errors throw. */
export async function readTextIfExists(filePath: string): Promise<string | null> {
  return await nullOn(readFile(filePath, "utf8"), "ENOENT");
}

/** The bytes of `filePath`, or `null` when it does not exist; other errors throw. */
export async function readBytesIfExists(filePath: string): Promise<Buffer | null> {
  return await nullOn(readFile(filePath), "ENOENT");
}

/** The permission bits of `filePath`, or `null` when it does not exist; other errors throw. */
export async function readModeIfExists(filePath: string): Promise<number | null> {
  return await nullOn(
    stat(filePath).then((stats) => stats.mode & 0o777),
    "ENOENT",
  );
}

/** Whether `filePath` names an existing file or directory. */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "EISDIR"))
      return await directoryExists(filePath);
    throw error;
  }
}

async function directoryExists(filePath: string): Promise<boolean> {
  try {
    await readdir(filePath);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

/** `read`'s value, or `null` when it fails with one of `codes`. */
async function nullOn<T>(read: Promise<T>, ...codes: string[]): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if (codes.some((code) => isErrno(error, code))) return null;
    throw error;
  }
}
