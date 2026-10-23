import { chmod, mkdir, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractMarkedBlock,
  markerSyntaxOf,
  mergeJson,
  replaceMarkedBlock,
} from "@caplet/adapters/common";
import {
  type AcfManagedSidecar,
  type AcfOwnership,
  type Diagnostic,
  type FileContent,
  type FileDiff,
  isErrno,
} from "@caplet/core";
import { readBytesIfExists, readModeIfExists, readTextIfExists } from "../internal/fs.js";
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

/** What {@link applyDiffs} did, as sorted absolute paths, and the sidecar it wrote. */
export type ApplyResult = {
  written: string[];
  deleted: string[];
  unchanged: string[];
  /** Absolute paths whose change was skipped because they no longer matched the plan. */
  skipped: string[];
  diagnostics: Diagnostic[];
  sidecar: AcfManagedSidecar;
};

/** The output root, capability and sidecar one {@link applyDiffs} call writes for. */
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
  const ownership = await inspectFileOwnership(diffs, opts, sidecar);
  if (ownership.diagnostics.length > 0) {
    return {
      written: [],
      deleted: [],
      unchanged: [],
      skipped: diffs.map((diff) => resolveDiffPath(opts.installRoot, diff.path)),
      diagnostics: ownership.diagnostics,
      sidecar,
    };
  }
  const written: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const diff of diffs) {
    const absolutePath = resolveDiffPath(opts.installRoot, diff.path);
    const relativePath = relativeSidecarPath(opts.installRoot, absolutePath);
    if (!(await matchesPlan(diff, absolutePath))) {
      skipped.push(absolutePath);
      diagnostics.push(driftDiagnostic(diff, absolutePath, opts.capabilityName));
      continue;
    }
    const applied = isWholeFile(diff.owns)
      ? await applyWholeFile(diff, absolutePath, opts.installRoot)
      : await applyOwnedRegions(diff, absolutePath);
    if (!applied.changed) unchanged.push(absolutePath);
    else if (applied.content === null) deleted.push(absolutePath);
    else written.push(absolutePath);
    if (diff.after === null)
      dropRemovedEntries(sidecar, diff.owns, relativePath, opts.capabilityName);
    else mergeSidecarEntry(sidecar, await managedEntry(diff, applied.content, absolutePath, opts));
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

/** Drops the capability's entries for `relativePath` whose every region the removal owns. */
function dropRemovedEntries(
  sidecar: AcfManagedSidecar,
  owns: readonly AcfOwnership[],
  relativePath: string,
  capability: string,
): void {
  const removed = new Set(owns.map(ownershipKey));
  sidecar.managed = sidecar.managed.filter(
    (entry) =>
      !(
        entry.path === relativePath &&
        entry.capability === capability &&
        entry.owns.every((own) => removed.has(ownershipKey(own)))
      ),
  );
}

/** The sidecar entry recording what an applied write owns, with the file's mode when whole. */
async function managedEntry(
  diff: FileDiff,
  content: FileContent | null,
  absolutePath: string,
  opts: ApplyDiffsOptions,
): Promise<ManagedEntry> {
  const entry: ManagedEntry = {
    path: relativeSidecarPath(opts.installRoot, absolutePath),
    owns: diff.owns,
    capability: opts.capabilityName,
    hash: hashOwnedRegions(content, diff.owns),
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
  return entry;
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
  const action = diffAction(diff) === "delete" ? "delete" : "update";
  return {
    severity: "warn",
    code: "acf.apply.drift",
    message: `skipped ${action} of ${absolutePath}: it changed after the plan was computed; run apply again to review`,
    path: absolutePath,
    capability: { name: capability },
  };
}

/**
 * What applying `diff` does to its file. Removing owned regions rewrites the file around them, so
 * only a whole-file removal is a delete; a diff with no prior content creates the file.
 */
export function diffAction(
  diff: Pick<FileDiff, "before" | "after" | "owns">,
): "create" | "update" | "delete" {
  if (diff.after === null) return isWholeFile(diff.owns) ? "delete" : "update";
  return diff.before === null ? "create" : "update";
}

function isWholeFile(owns: readonly AcfOwnership[]): boolean {
  return owns.some((own) => own.kind === "file");
}

/**
 * Checks whole-file ownership before planning or applying a capability. Existing identical
 * files may be adopted; regions in shared native files retain their adapter-defined ownership.
 * Adoptions must reach apply even when the file bytes do not change, to record the sidecar.
 */
export async function inspectFileOwnership(
  diffs: readonly FileDiff[],
  opts: ApplyDiffsOptions,
  recorded?: AcfManagedSidecar,
): Promise<{ diagnostics: Diagnostic[]; adoptions: Set<string> }> {
  const sidecar = recorded ?? (await readSidecar(opts.sidecarPath));
  const diagnostics: Diagnostic[] = [];
  const adoptions = new Set<string>();
  for (const diff of diffs) {
    if (!isWholeFile(diff.owns)) continue;
    const absolutePath = resolveDiffPath(opts.installRoot, diff.path);
    const relativePath = relativeSidecarPath(opts.installRoot, absolutePath);
    if (sidecar.managed.some((entry) => entry.path === relativePath && isWholeFile(entry.owns)))
      continue;
    let current: Uint8Array | null;
    try {
      current = await readBytesIfExists(absolutePath);
    } catch (error) {
      if (!isErrno(error, "EISDIR")) throw error;
      current = null;
      diagnostics.push(unownedDiagnostic(absolutePath, opts.capabilityName));
      continue;
    }
    if (current === null) continue;
    if (diff.after !== null && contentEquals(current, diff.after)) adoptions.add(diff.path);
    else diagnostics.push(unownedDiagnostic(absolutePath, opts.capabilityName));
  }
  return { diagnostics, adoptions };
}

function unownedDiagnostic(absolutePath: string, capability: string): Diagnostic {
  return {
    severity: "error",
    code: "acf.apply.unowned",
    path: absolutePath,
    capability: { name: capability },
    message: `refusing to replace or delete unowned path ${absolutePath}; move or delete it, then run apply again (if the ownership sidecar was lost, restore it from backup)`,
  };
}

/** What applying one diff left in its file, and whether the file changed. */
type AppliedDiff = { content: FileContent | null; changed: boolean };

/** Writes or deletes a whole-file diff (deleting prunes emptied directories up to the root). */
async function applyWholeFile(
  diff: FileDiff,
  absolutePath: string,
  installRoot: string,
): Promise<AppliedDiff> {
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

/** Merges or strips the JSON-pointer and marker regions a diff owns, leaving the rest. */
async function applyOwnedRegions(diff: FileDiff, absolutePath: string): Promise<AppliedDiff> {
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

/**
 * The file a diff path names: absolute as given, one starting with `.` against the process cwd
 * (so `.claude/x` too, not only `./x`), any other relative to the install root. Adapters write
 * project-scope skill roots (`.agents/skills`, a target's `skillInstallPaths` such as
 * `.claude/skills`) relative to the project, which caplet makes the process cwd; resolving them
 * against the install root would nest them inside it.
 */
export function resolveDiffPath(installRoot: string, diffPath: string): string {
  if (path.isAbsolute(diffPath)) return path.normalize(diffPath);
  if (diffPath.startsWith(".")) return path.resolve(process.cwd(), diffPath);
  return path.resolve(installRoot, diffPath);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
