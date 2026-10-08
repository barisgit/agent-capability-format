import { chmod, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractMarkedBlock, mergeJson, replaceMarkedBlock } from "@caplet/adapters/common";
import type { AcfManagedSidecar, AcfOwnership, FileContent, FileDiff } from "@caplet/core";
import { getJsonPointer, hasJsonPointer } from "./json-pointer.js";
import {
  hashOwnedRegions,
  mergeSidecarEntry,
  readSidecar,
  relativeSidecarPath,
  removeOwnedRegionsFromText,
  writeSidecar,
} from "./sidecar.js";

export type ApplyResult = {
  written: string[];
  deleted: string[];
  unchanged: string[];
  sidecar: AcfManagedSidecar;
};

export async function applyDiffs(
  diffs: FileDiff[],
  opts: { installRoot: string; capabilityName: string; sidecarPath: string },
): Promise<ApplyResult> {
  const sidecar = await readSidecar(opts.sidecarPath);
  const written: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  for (const diff of diffs) {
    const absolutePath = resolveDiffPath(opts.installRoot, diff.path);
    const relativePath = relativeSidecarPath(opts.installRoot, absolutePath);
    if (diff.managementNotice !== undefined) {
      await assertNoticePathOwnedOrAbsent(sidecar, relativePath, absolutePath);
    }
    const applied = await applyOneDiff(diff, absolutePath, opts.installRoot);

    if (diff.after === null) {
      sidecar.managed = sidecar.managed.filter(
        (entry) => !(entry.path === relativePath && entry.capability === opts.capabilityName),
      );
      if (!applied.changed) unchanged.push(absolutePath);
      else if (applied.content === null) deleted.push(absolutePath);
      else written.push(absolutePath);
      continue;
    }

    if (applied.changed) written.push(absolutePath);
    else unchanged.push(absolutePath);

    const entry: AcfManagedSidecar["managed"][number] = {
      path: relativePath,
      owns: diff.owns,
      capability: opts.capabilityName,
      hash: hashOwnedRegions(applied.content, diff.owns),
    };
    if (diff.facet !== undefined) entry.facet = diff.facet;
    mergeSidecarEntry(sidecar, entry);
  }

  await writeSidecar(opts.sidecarPath, sidecar);
  return {
    written: uniqueSorted(written),
    deleted: uniqueSorted(deleted),
    unchanged: uniqueSorted(unchanged),
    sidecar,
  };
}

async function assertNoticePathOwnedOrAbsent(
  sidecar: AcfManagedSidecar,
  relativePath: string,
  absolutePath: string,
): Promise<void> {
  const owned = sidecar.managed.some(
    (entry) =>
      entry.path === relativePath && entry.owns.some((ownership) => ownership.kind === "file"),
  );
  if (owned) return;
  try {
    await stat(absolutePath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return;
    throw error;
  }
  throw new Error(`refusing to overwrite unowned reserved notice path: ${absolutePath}`);
}

async function applyOneDiff(
  diff: FileDiff,
  absolutePath: string,
  installRoot: string,
): Promise<{ content: FileContent | null; changed: boolean }> {
  if (diff.owns.some((own) => own.kind === "file")) {
    const byteOriented = diff.before instanceof Uint8Array || diff.after instanceof Uint8Array;
    const before = byteOriented
      ? await readBytesIfExists(absolutePath)
      : await readTextIfExists(absolutePath);
    const beforeMode = await readModeIfExists(absolutePath);
    if (diff.after === null) {
      await rm(absolutePath, { force: true });
      await pruneEmptyDirs(path.dirname(absolutePath), installRoot);
      return { content: null, changed: before !== null };
    }
    const contentChanged = !contentEquals(before, diff.after);
    const afterMode = diff.afterMode;
    const modeChanged = afterMode !== undefined && afterMode !== null && beforeMode !== afterMode;
    if (contentChanged) await writeContent(absolutePath, diff.after);
    if (modeChanged) await chmod(absolutePath, afterMode);
    return { content: diff.after, changed: contentChanged || modeChanged };
  }

  const before = await readTextIfExists(absolutePath);
  if (diff.after === null) {
    if (before === null) return { content: null, changed: false };
    const stripped = removeOwnedRegionsFromText(before, diff.owns);
    if (stripped !== before) await writeContent(absolutePath, stripped);
    return { content: stripped, changed: stripped !== before };
  }
  const diffAfter = textContent(diff.after);
  let after = before ?? defaultTextFor(diff.owns);
  for (const own of diff.owns) {
    if (own.kind === "json-pointer") after = applyJsonPointer(after, own.pointer, diffAfter);
    else if (own.kind === "marker") after = applyMarker(after, own.name, diffAfter);
    else throw new Error(`unsupported ownership kind for apply: ${own.kind}`);
  }

  if (after !== before) await writeContent(absolutePath, after);
  return { content: after, changed: after !== before };
}

function applyJsonPointer(currentText: string, pointer: string, afterText: string | null): string {
  if (afterText === null) return currentText;
  const parsed: unknown = JSON.parse(afterText);
  const value = hasJsonPointer(parsed, pointer) ? getJsonPointer(parsed, pointer) : parsed;
  return mergeJson(currentText, pointer, value);
}

function applyMarker(currentText: string, name: string, afterText: string | null): string {
  if (afterText === null) return currentText;
  const body = extractMarkedBlock(afterText, name) ?? afterText;
  return replaceMarkedBlock(currentText, name, body);
}

async function pruneEmptyDirs(dir: string, boundary: string): Promise<void> {
  const root = path.resolve(boundary);
  let current = path.resolve(dir);
  for (;;) {
    if (current === root || !current.startsWith(root + path.sep)) return;
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    try {
      await rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

function defaultTextFor(owns: readonly AcfOwnership[]): string {
  if (owns.every((own) => own.kind === "json-pointer")) return "{}\n";
  return "";
}

async function writeContent(filePath: string, content: FileContent): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

async function readBytesIfExists(filePath: string): Promise<Uint8Array | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

async function readModeIfExists(filePath: string): Promise<number | null> {
  try {
    return (await stat(filePath)).mode & 0o777;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

function textContent(content: FileContent | null): string | null {
  if (content === null || typeof content === "string") return content;
  throw new Error("structured ownership requires text content");
}

function contentEquals(left: FileContent | null, right: FileContent | null): boolean {
  if (left === null || right === null) return left === right;
  if (typeof left === "string" || typeof right === "string") return left === right;
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function resolveDiffPath(installRoot: string, diffPath: string): string {
  if (path.isAbsolute(diffPath)) return path.normalize(diffPath);
  if (diffPath.startsWith(".")) return path.resolve(process.cwd(), diffPath);
  return path.resolve(installRoot, diffPath);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
