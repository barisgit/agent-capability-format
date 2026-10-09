import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractMarkedBlock, removeMarkedBlock } from "@caplet/adapters/common";
import {
  type AcfManagedSidecar,
  type AcfOwnership,
  type Carrier,
  type Diagnostic,
  type FacetFamily,
  type FileContent,
  type SidecarTarget,
  targetIds,
} from "@caplet/core";
import { containmentViolation, fileOwnership, type OutputBoundary } from "./containment.js";
import { deleteJsonPointerText, getJsonPointer, hasJsonPointer } from "./json-pointer.js";

/** The sidecar's file name directly under each output root it describes. */
export const SIDECAR_FILENAME = ".acf-managed.json";

export type ManagedEntry = AcfManagedSidecar["managed"][number];
/** Target and carrier recorded on entries written for one output root. */
export type SidecarOwner = { target: SidecarTarget; carrier: Carrier };
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

/**
 * Writes the sidecar in canonical order. With `owner`, entries from sidecars written before
 * entries recorded their target and carrier are upgraded to that root's owner.
 */
export async function writeSidecar(
  sidecarPath: string,
  sidecar: AcfManagedSidecar,
  owner?: SidecarOwner,
): Promise<void> {
  if (owner !== undefined) {
    for (const entry of sidecar.managed) {
      entry.target ??= owner.target;
      entry.carrier ??= owner.carrier;
    }
  }
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

/**
 * Paths `capabilityName` owns under `installRoot` that would leave `boundary` once existing parent
 * directories are followed. Callers check this before `removeOwnedRegions` so a refused removal
 * changes nothing.
 */
export async function ownedPathViolations(
  sidecar: AcfManagedSidecar,
  installRoot: string,
  capabilityName: string,
  boundary: OutputBoundary,
): Promise<string[]> {
  const violations: string[] = [];
  const selected = sidecar.managed.filter((entry) => entry.capability === capabilityName);
  for (const [relativePath, entries] of groupByPath(selected)) {
    const violation = await containmentViolation(
      path.resolve(installRoot, relativePath),
      boundary,
      fileOwnership(entries.flatMap((entry) => entry.owns)),
    );
    if (violation !== null) violations.push(violation);
  }
  return violations;
}

/** Removes everything `capabilityName` owns under `installRoot` and drops its entries. */
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
  const sidecar: AcfManagedSidecar = {
    acf: 1,
    managed: value.managed.map((entry) => parseEntry(entry, sidecarPath)),
  };
  if (value.marketplace !== undefined) {
    const record = value.marketplace;
    if (
      !isRecord(record) ||
      typeof record.name !== "string" ||
      (record.scope !== "user" && record.scope !== "local")
    ) {
      throw new Error(`invalid sidecar marketplace at ${sidecarPath}`);
    }
    sidecar.marketplace = { name: record.name, scope: record.scope };
  }
  return sidecar;
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
  if (value.target !== undefined) {
    if (!isSidecarTarget(value.target)) throw new Error("invalid sidecar target");
    entry.target = value.target;
  }
  if (value.carrier !== undefined) {
    if (value.carrier !== "plugin" && value.carrier !== "loose") {
      throw new Error("invalid sidecar carrier");
    }
    entry.carrier = value.carrier;
  }
  if (value.mode !== undefined) {
    if (typeof value.mode !== "number" || !Number.isInteger(value.mode)) {
      throw new Error("invalid sidecar mode");
    }
    entry.mode = value.mode;
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
  return {
    acf: 1,
    ...(sidecar.marketplace === undefined
      ? {}
      : { marketplace: { name: sidecar.marketplace.name, scope: sidecar.marketplace.scope } }),
    managed: sortEntries(sidecar.managed.map(canonicalEntry)),
  };
}

function canonicalEntry(entry: ManagedEntry): ManagedEntry {
  // Insertion order is the serialized order.
  return {
    path: entry.path,
    owns: [...entry.owns].sort((a, b) => ownershipKey(a).localeCompare(ownershipKey(b))),
    capability: entry.capability,
    ...(entry.facet === undefined ? {} : { facet: entry.facet }),
    ...(entry.target === undefined ? {} : { target: entry.target }),
    ...(entry.carrier === undefined ? {} : { carrier: entry.carrier }),
    ...(entry.mode === undefined ? {} : { mode: entry.mode }),
    hash: entry.hash,
  };
}

function sortEntries(entries: ManagedEntry[]): ManagedEntry[] {
  return [...entries].sort((a, b) => entryIdentity(a).localeCompare(entryIdentity(b)));
}

function entryIdentity(entry: ManagedEntry): string {
  return `${entry.path}\0${entry.capability}\0${entry.facet?.family ?? ""}\0${entry.facet?.name ?? ""}\0${entry.owns.map(ownershipKey).sort().join("|")}`;
}

/** Stable identity of one owned region within a file, e.g. `json-pointer:/mcpServers/x`. */
export function ownershipKey(own: AcfOwnership): string {
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

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSidecarTarget(value: unknown): value is SidecarTarget {
  return value === "canonical" || targetIds.some((id) => id === value);
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
