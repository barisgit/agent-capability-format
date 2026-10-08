import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractMarkedBlock } from "@caplet/adapters/common";
import type {
  AcfManagedSidecar,
  AcfOwnership,
  Diagnostic,
  FacetFamily,
  FileContent,
} from "@caplet/core";
import { deleteJsonPointerText, getJsonPointer, hasJsonPointer } from "./json-pointer.js";

export type ManagedEntry = AcfManagedSidecar["managed"][number];
export type DriftFs = {
  readText(filePath: string): string | null;
  readBytes?(filePath: string): Uint8Array | null;
};
export type RemoveOwnedRegionsResult = {
  written: string[];
  deleted: string[];
  unchanged: string[];
  sidecar: AcfManagedSidecar;
};

export async function readSidecar(sidecarPath: string): Promise<AcfManagedSidecar> {
  let raw: string;
  try {
    raw = await readFile(sidecarPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return emptySidecar();
    throw error;
  }
  return parseSidecar(JSON.parse(raw) as unknown, sidecarPath);
}

export async function writeSidecar(sidecarPath: string, sidecar: AcfManagedSidecar): Promise<void> {
  await mkdir(path.dirname(sidecarPath), { recursive: true });
  await writeFile(sidecarPath, `${JSON.stringify(canonicalSidecar(sidecar), null, 2)}\n`, "utf8");
}

export function mergeSidecarEntry(
  sidecar: AcfManagedSidecar,
  entry: ManagedEntry,
): AcfManagedSidecar {
  const key = entryIdentity(entry);
  const managed = sidecar.managed.filter((candidate) => entryIdentity(candidate) !== key);
  managed.push(canonicalEntry(entry));
  sidecar.managed = sortEntries(managed);
  return sidecar;
}

export function detectDrift(sidecar: AcfManagedSidecar, fs: DriftFs): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const entry of sidecar.managed) {
    const current =
      entry.owns.some((own) => own.kind === "file") && fs.readBytes !== undefined
        ? fs.readBytes(entry.path)
        : fs.readText(entry.path);
    const hash = hashOwnedRegions(current, entry.owns);
    if (hash === entry.hash) continue;
    diagnostics.push({
      severity: "info",
      code: "acf.emit.drift",
      message: `managed region drifted: ${entry.path}`,
      path: entry.path,
      capability: { name: entry.capability },
      data: { expected: entry.hash, actual: hash, owns: entry.owns },
    });
  }
  return diagnostics;
}

export async function removeOwnedRegions(
  sidecar: AcfManagedSidecar,
  installRoot: string,
  capabilityName: string,
): Promise<RemoveOwnedRegionsResult> {
  const selected = sidecar.managed.filter((entry) => entry.capability === capabilityName);
  const grouped = groupByPath(selected);
  const written: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  for (const [relativePath, entries] of grouped) {
    const absolutePath = path.resolve(installRoot, relativePath);
    const owns = entries.flatMap((entry) => entry.owns);
    if (owns.some((own) => own.kind === "file")) {
      await rm(absolutePath, { force: true });
      deleted.push(absolutePath);
      continue;
    }

    const before = await readTextIfExists(absolutePath);
    if (before === null) {
      unchanged.push(absolutePath);
      continue;
    }
    const after = removeOwnedRegionsFromText(before, owns);
    if (after === before) {
      unchanged.push(absolutePath);
      continue;
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, after, "utf8");
    written.push(absolutePath);
  }

  sidecar.managed = sortEntries(
    sidecar.managed.filter((entry) => entry.capability !== capabilityName),
  );
  return { written: written.sort(), deleted: deleted.sort(), unchanged: unchanged.sort(), sidecar };
}

export function removeOwnedRegionsFromText(text: string, owns: readonly AcfOwnership[]): string {
  let after = text;
  for (const own of owns) {
    if (own.kind === "json-pointer") after = deleteJsonPointerText(after, own.pointer);
    if (own.kind === "marker") after = removeMarkedBlock(after, own.name);
  }
  return after;
}

export function hashOwnedRegions(
  content: FileContent | null,
  owns: readonly AcfOwnership[],
): string {
  const hash = createHash("sha256");
  for (const own of [...owns].sort((a, b) => ownershipKey(a).localeCompare(ownershipKey(b)))) {
    hash.update(ownershipKey(own));
    hash.update(Buffer.from([0]));
    hash.update(regionContent(content, own));
    hash.update(Buffer.from([0]));
  }
  return `sha256-${hash.digest("hex")}`;
}

export function relativeSidecarPath(installRoot: string, filePath: string): string {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(installRoot, filePath);
  return path.relative(installRoot, absolute).split(path.sep).join("/") || ".";
}

function emptySidecar(): AcfManagedSidecar {
  return { acf: 1, managed: [] };
}

function parseSidecar(value: unknown, sidecarPath: string): AcfManagedSidecar {
  if (!isRecord(value) || value.acf !== 1 || !Array.isArray(value.managed)) {
    throw new Error(`invalid ACF sidecar at ${sidecarPath}`);
  }
  return { acf: 1, managed: value.managed.map((entry) => parseEntry(entry, sidecarPath)) };
}

function parseEntry(value: unknown, sidecarPath: string): ManagedEntry {
  if (!isRecord(value)) throw new Error(`invalid ACF sidecar entry at ${sidecarPath}`);
  if (typeof value.path !== "string") throw new Error("invalid sidecar path");
  if (typeof value.capability !== "string") throw new Error("invalid sidecar capability");
  if (typeof value.hash !== "string") throw new Error("invalid sidecar hash");
  if (!Array.isArray(value.owns)) throw new Error("invalid sidecar owns");
  const entry: ManagedEntry = {
    path: value.path,
    owns: value.owns.map((own) => parseOwnership(own)),
    capability: value.capability,
    hash: value.hash,
  };
  if (isRecord(value.facet)) {
    const family = value.facet.family;
    const name = value.facet.name;
    if (isFacetFamily(family) && typeof name === "string") entry.facet = { family, name };
  }
  return entry;
}

function parseOwnership(value: unknown): AcfOwnership {
  if (!isRecord(value) || typeof value.kind !== "string") throw new Error("invalid ownership");
  if (value.kind === "file") return { kind: "file" };
  if (value.kind === "json-pointer" && typeof value.pointer === "string") {
    return { kind: "json-pointer", pointer: value.pointer };
  }
  if (value.kind === "yaml-pointer" && typeof value.pointer === "string") {
    return { kind: "yaml-pointer", pointer: value.pointer };
  }
  if (value.kind === "toml-pointer" && typeof value.pointer === "string") {
    return { kind: "toml-pointer", pointer: value.pointer };
  }
  if (value.kind === "marker" && typeof value.name === "string") {
    return { kind: "marker", name: value.name };
  }
  throw new Error("invalid ownership");
}

function canonicalSidecar(sidecar: AcfManagedSidecar): AcfManagedSidecar {
  return { acf: 1, managed: sortEntries(sidecar.managed.map(canonicalEntry)) };
}

function canonicalEntry(entry: ManagedEntry): ManagedEntry {
  const out: ManagedEntry = {
    path: entry.path,
    owns: [...entry.owns].sort((a, b) => ownershipKey(a).localeCompare(ownershipKey(b))),
    capability: entry.capability,
    hash: entry.hash,
  };
  if (entry.facet !== undefined) out.facet = entry.facet;
  return out;
}

function sortEntries(entries: ManagedEntry[]): ManagedEntry[] {
  return [...entries].sort((a, b) => entryIdentity(a).localeCompare(entryIdentity(b)));
}

function entryIdentity(entry: ManagedEntry): string {
  return `${entry.path}\0${entry.capability}\0${entry.facet?.family ?? ""}\0${entry.facet?.name ?? ""}\0${entry.owns.map(ownershipKey).sort().join("|")}`;
}

function ownershipKey(own: AcfOwnership): string {
  switch (own.kind) {
    case "file":
      return "file";
    case "json-pointer":
    case "yaml-pointer":
    case "toml-pointer":
      return `${own.kind}:${own.pointer}`;
    case "marker":
      return `marker:${own.name}`;
  }
}

function regionContent(content: FileContent | null, own: AcfOwnership): FileContent {
  if (content === null) return "";
  if (own.kind === "file") return content;
  if (typeof content !== "string") {
    throw new Error("structured ownership requires text content");
  }
  const text = content;
  if (own.kind === "marker") return extractMarkedBlock(text, own.name) ?? "";
  if (own.kind !== "json-pointer") return text;
  if (text.trim() === "") return "";
  const parsed: unknown = JSON.parse(text);
  return hasJsonPointer(parsed, own.pointer) ? stableJson(getJsonPointer(parsed, own.pointer)) : "";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    const parts = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

function groupByPath(entries: ManagedEntry[]): Map<string, ManagedEntry[]> {
  const grouped = new Map<string, ManagedEntry[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.path) ?? [];
    bucket.push(entry);
    grouped.set(entry.path, bucket);
  }
  return grouped;
}

function removeMarkedBlock(text: string, name: string): string {
  const begin = `<!-- acf:begin ${name} -->`;
  const end = `<!-- acf:end ${name} -->`;
  const start = text.indexOf(begin);
  if (start === -1) return text;
  const finish = text.indexOf(end, start + begin.length);
  if (finish === -1) return text;
  const removeEnd = consumeOneLineBreak(text, finish + end.length);
  return `${text.slice(0, start)}${text.slice(removeEnd)}`;
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

function consumeOneLineBreak(text: string, index: number): number {
  if (text[index] === "\r" && text[index + 1] === "\n") return index + 2;
  if (text[index] === "\n") return index + 1;
  return index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFacetFamily(value: unknown): value is FacetFamily {
  return (
    value === "skill" ||
    value === "agent" ||
    value === "command" ||
    value === "instruction" ||
    value === "hook" ||
    value === "mcp"
  );
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return isRecord(error) && error.code === code;
}
