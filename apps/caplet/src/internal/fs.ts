import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ReadOnlyFs } from "@caplet/core";

export function diskReadOnlyFs(): ReadOnlyFs {
  return {
    async exists(absPath) {
      return await exists(absPath);
    },
    async readMode(absPath) {
      try {
        return (await stat(absPath)).mode & 0o777;
      } catch (error) {
        if (isErrno(error, "ENOENT")) return null;
        throw error;
      }
    },
    async readText(absPath) {
      try {
        return await readFile(absPath, "utf8");
      } catch (error) {
        if (isErrno(error, "ENOENT")) return null;
        throw error;
      }
    },
    async readBytes(absPath) {
      try {
        return await readFile(absPath);
      } catch (error) {
        if (isErrno(error, "ENOENT")) return null;
        throw error;
      }
    },
    async listDir(absPath) {
      try {
        return await readdir(absPath);
      } catch (error) {
        if (isErrno(error, "ENOENT")) return [];
        throw error;
      }
    },
  };
}

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

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
