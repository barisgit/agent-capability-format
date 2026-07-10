import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { extractMarkedBlock, mergeJson, replaceMarkedBlock } from "@acf/adapters/common";
import type { AcfManagedSidecar, AcfOwnership, FileDiff } from "@acf/core";
import { getJsonPointer, hasJsonPointer } from "./json-pointer";
import {
  hashOwnedRegions,
  mergeSidecarEntry,
  readSidecar,
  relativeSidecarPath,
  writeSidecar,
} from "./sidecar";

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
    const applied = await applyOneDiff(diff, absolutePath);

    if (applied.text === null) {
      sidecar.managed = sidecar.managed.filter(
        (entry) => !(entry.path === relativePath && entry.capability === opts.capabilityName),
      );
      if (applied.changed) deleted.push(absolutePath);
      else unchanged.push(absolutePath);
      continue;
    }

    if (applied.changed) written.push(absolutePath);
    else unchanged.push(absolutePath);

    mergeSidecarEntry(sidecar, {
      path: relativePath,
      owns: diff.owns,
      capability: opts.capabilityName,
      hash: hashOwnedRegions(applied.text, diff.owns),
    });
  }

  await writeSidecar(opts.sidecarPath, sidecar);
  return {
    written: uniqueSorted(written),
    deleted: uniqueSorted(deleted),
    unchanged: uniqueSorted(unchanged),
    sidecar,
  };
}

async function applyOneDiff(
  diff: FileDiff,
  absolutePath: string,
): Promise<{ text: string | null; changed: boolean }> {
  const before = await readTextIfExists(absolutePath);
  if (diff.owns.some((own) => own.kind === "file")) {
    if (diff.after === null) {
      await rm(absolutePath, { force: true });
      return { text: null, changed: before !== null };
    }
    if (before !== diff.after) await writeText(absolutePath, diff.after);
    return { text: diff.after, changed: before !== diff.after };
  }

  let after = before ?? defaultTextFor(diff.owns);
  for (const own of diff.owns) {
    if (own.kind === "json-pointer") after = applyJsonPointer(after, own.pointer, diff.after);
    else if (own.kind === "marker") after = applyMarker(after, own.name, diff.after);
    else throw new Error(`unsupported ownership kind for apply: ${own.kind}`);
  }

  if (after !== before) await writeText(absolutePath, after);
  return { text: after, changed: after !== before };
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

function defaultTextFor(owns: readonly AcfOwnership[]): string {
  if (owns.every((own) => own.kind === "json-pointer")) return "{}\n";
  return "";
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await Bun.write(filePath, text);
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

function resolveDiffPath(installRoot: string, diffPath: string): string {
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
