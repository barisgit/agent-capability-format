import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isErrno } from "./guards.js";

export async function exists(absPath: string): Promise<boolean> {
  try {
    await lstat(absPath);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

export async function readText(absPath: string): Promise<string> {
  return await readFile(absPath, "utf8");
}

export async function readBytes(absPath: string): Promise<Uint8Array> {
  return await readFile(absPath);
}

export async function listDir(absPath: string): Promise<string[]> {
  try {
    return (await readdir(absPath)).sort();
  } catch (error) {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  }
}

export async function listRegularFilesRecursive(
  root: string,
  options: { rejectSymlinks?: boolean; rejectSpecial?: boolean } = {},
): Promise<string[]> {
  const files: string[] = [];
  await walk(root, files, options);
  return files;
}

async function walk(
  current: string,
  files: string[],
  options: { rejectSymlinks?: boolean; rejectSpecial?: boolean },
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) {
      if (options.rejectSymlinks === true) throw new Error(`symlink not allowed: ${full}`);
      continue;
    }
    if (stat.isDirectory()) {
      await walk(full, files, options);
      continue;
    }
    if (stat.isFile()) {
      files.push(full);
      continue;
    }
    if (options.rejectSpecial === true) throw new Error(`special file not allowed: ${full}`);
  }
}
