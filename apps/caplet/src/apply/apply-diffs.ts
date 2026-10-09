import { chmod, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractMarkedBlock,
  markerSyntaxOf,
  mergeJson,
  replaceMarkedBlock,
} from "@caplet/adapters/common";
import type {
  AcfManagedSidecar,
  AcfOwnership,
  Diagnostic,
  FileContent,
  FileDiff,
} from "@caplet/core";
import { getJsonPointer, hasJsonPointer } from "./json-pointer.js";
import {
  hashOwnedRegions,
  type ManagedEntry,
  mergeSidecarEntry,
  ownershipKey,
  readSidecar,
  relativeSidecarPath,
  removeOwnedRegionsFromText,
  type SidecarOwner,
  writeSidecar,
} from "./sidecar.js";

export type ApplyResult = {
  written: string[];
  deleted: string[];
  unchanged: string[];
  /** Absolute paths whose change was skipped because they no longer matched the plan. */
  skipped: string[];
  diagnostics: Diagnostic[];
  sidecar: AcfManagedSidecar;
};

export type ApplyDiffsOptions = {
  installRoot: string;
  capabilityName: string;
  sidecarPath: string;
  /** Recorded on new entries and filled into entries from older sidecars. */
  owner?: SidecarOwner | undefined;
};

/**
 * Applies one capability's diffs under one output root and records its ownership in the sidecar.
 *
 * A diff's `before` is the content its plan saw and acts as the precondition: when the regions
 * the diff owns no longer match it on disk, the change is skipped with an `acf.apply.drift`
 * warning and neither the file nor its sidecar entries change. Callers check output containment
 * before calling (see `containmentViolation`).
 */
export async function applyDiffs(diffs: FileDiff[], opts: ApplyDiffsOptions): Promise<ApplyResult> {
  const sidecar = await readSidecar(opts.sidecarPath);
  const written: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const diff of diffs) {
    const absolutePath = resolveDiffPath(opts.installRoot, diff.path);
    const relativePath = relativeSidecarPath(opts.installRoot, absolutePath);
    if (diff.managementNotice !== undefined) {
      await assertNoticePathOwnedOrAbsent(sidecar, relativePath, absolutePath);
    }
    if (!(await matchesPlan(diff, absolutePath))) {
      skipped.push(absolutePath);
      diagnostics.push(driftDiagnostic(diff, absolutePath, opts.capabilityName));
      continue;
    }
    const applied = await applyOneDiff(diff, absolutePath, opts.installRoot);

    if (diff.after === null) {
      const removed = new Set(diff.owns.map(ownershipKey));
      sidecar.managed = sidecar.managed.filter(
        (entry) =>
          !(
            entry.path === relativePath &&
            entry.capability === opts.capabilityName &&
            entry.owns.every((own) => removed.has(ownershipKey(own)))
          ),
      );
      if (!applied.changed) unchanged.push(absolutePath);
      else if (applied.content === null) deleted.push(absolutePath);
      else written.push(absolutePath);
      continue;
    }

    if (applied.changed) written.push(absolutePath);
    else unchanged.push(absolutePath);

    const entry: ManagedEntry = {
      path: relativePath,
      owns: diff.owns,
      capability: opts.capabilityName,
      hash: hashOwnedRegions(applied.content, diff.owns),
    };
    if (diff.facet !== undefined) entry.facet = diff.facet;
    if (opts.owner !== undefined) {
      entry.target = opts.owner.target;
      entry.carrier = opts.owner.carrier;
    }
    if (isWholeFile(diff.owns)) {
      const mode = await readModeIfExists(absolutePath);
      if (mode !== null) entry.mode = mode;
    }
    mergeSidecarEntry(sidecar, entry);
  }

  await writeSidecar(opts.sidecarPath, sidecar, opts.owner);
  return {
    written: uniqueSorted(written),
    deleted: uniqueSorted(deleted),
    unchanged: uniqueSorted(unchanged),
    skipped: uniqueSorted(skipped),
    diagnostics,
    sidecar,
  };
}

/** True when the regions `diff` owns are on disk exactly as the plan saw them in `before`. */
async function matchesPlan(diff: FileDiff, absolutePath: string): Promise<boolean> {
  if (isWholeFile(diff.owns)) {
    const current =
      diff.before instanceof Uint8Array
        ? await readBytesIfExists(absolutePath)
        : await readTextIfExists(absolutePath);
    return contentEquals(current, diff.before);
  }
  const current = await readTextIfExists(absolutePath);
  try {
    return hashOwnedRegions(current, diff.owns) === hashOwnedRegions(diff.before, diff.owns);
  } catch {
    // The file no longer parses as the structure the owned regions point into.
    return false;
  }
}

function driftDiagnostic(diff: FileDiff, absolutePath: string, capability: string): Diagnostic {
  const action = diff.after === null ? "delete" : "update";
  return {
    severity: "warn",
    code: "acf.apply.drift",
    message: `skipped ${action} of ${absolutePath}: it changed after the plan was computed; run apply again to review`,
    path: absolutePath,
    capability: { name: capability },
  };
}

function isWholeFile(owns: readonly AcfOwnership[]): boolean {
  return owns.some((own) => own.kind === "file");
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
  return replaceMarkedBlock(currentText, name, body, markerSyntaxOf(afterText, name));
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

/**
 * Whether two contents hold the same bytes. Text and bytes compare by their UTF-8 bytes, because
 * a file read from disk as bytes may be the same file an adapter produced as text.
 */
export function contentEquals(left: FileContent | null, right: FileContent | null): boolean {
  if (left === null || right === null) return left === right;
  if (typeof left === "string" && typeof right === "string") return left === right;
  return Buffer.from(bytesOf(left)).equals(bytesOf(right));
}

function bytesOf(content: FileContent): Uint8Array {
  return typeof content === "string" ? Buffer.from(content, "utf8") : content;
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
