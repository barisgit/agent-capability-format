import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilityEntry,
  computeCapabilityDigests,
  type Diagnostic,
  entryCapabilityHash,
  IMPORT_MARKER_FILENAME,
  type LockedCapability,
} from "@caplet/core";
import { matchCapabilitySelectors } from "./capability-selectors.js";
import type { FetchedCapability } from "./fetch.js";
import {
  inspectSource,
  type SourceCapabilityCandidate,
  type SourceInventory,
} from "./inventory.js";
import { type LockEntry, sourceString } from "./lockfile.js";
import { copySnapshot, SnapshotRejectedError } from "./snapshot.js";

/** One capability a resolution installed or kept, with the `capabilities.yml` entry it came from. */
export type CapabilityRecord = {
  entry: CapabilityEntry;
  /** Final name, after `rename`; also the snapshot directory name. */
  name: string;
  /** What the entry's `capabilities:` selectors matched (see `SourceCapabilityCandidate`). */
  selector: string;
  /** Snapshot directory: staged during resolution, under `capabilitiesDir` once committed. */
  root: string;
  /** Resolved commit; null for `path:` sources. */
  commit: string | null;
  /** v1 `capabilityHash` of the snapshot at `root`. */
  contentHash: string;
  /** Per-capability lock record; absent for capabilities locked before records existed. */
  lockRecord?: LockedCapability | undefined;
};

/** The staged snapshots of one fetched source and the lock entry recording them. */
export type MaterializedSource = {
  /** False when the source or a selected package failed; nothing staged may be committed. */
  ok: boolean;
  records: CapabilityRecord[];
  /** Null when nothing was selected or the source failed. */
  lockEntry: LockEntry | null;
  diagnostics: Diagnostic[];
};

/**
 * Stages the capabilities `entry` selects from a fetched source under `stagingDir`, one
 * snapshot per final name, and builds the lock entry with each snapshot's digests. Uses
 * `inspectedInventory` when the caller already inspected the source (`caplet add`).
 */
export async function materializeFetched(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  stagingDir: string,
  inspectedInventory?: SourceInventory,
): Promise<MaterializedSource> {
  const inventory =
    inspectedInventory ??
    (await inspectSource(fetched.root, {
      format: entry.format,
      rename: entry.rename,
      revision: fetched.commit,
    }));
  const diagnostics = [...inventory.diagnostics];
  const records: CapabilityRecord[] = [];
  const selected = matchCapabilitySelectors(entry, fetched.root, inventory);
  diagnostics.push(...selected.diagnostics);
  if (diagnostics.some((item) => item.severity === "error")) {
    return { ok: false, records, lockEntry: null, diagnostics };
  }

  for (const candidate of selected.candidates) {
    const name = finalCapabilityName(entry, candidate.name);
    const destination = capabilityPath(stagingDir, name);
    try {
      if (candidate.synthesized) {
        await materializeImportedSkill(candidate, destination, fetched.commit);
      } else {
        await copySnapshot(candidate.root, destination);
      }
    } catch (error) {
      if (!(error instanceof SnapshotRejectedError)) throw error;
      diagnostics.push(snapshotRejectedDiagnostic(name, error));
      return { ok: false, records: [], lockEntry: null, diagnostics };
    }
    const digests = await computeCapabilityDigests(destination);
    records.push({
      entry,
      name,
      selector: candidate.selector,
      root: destination,
      commit: fetched.commit,
      contentHash: digests.capabilityHash,
      lockRecord: {
        name,
        format: candidate.format,
        ...(candidate.formatVersion === undefined
          ? {}
          : { formatVersion: candidate.formatVersion }),
        path: selectedSourcePath(entry, candidate),
        ...digests,
      },
    });
  }

  if (records.length === 0) return { ok: true, records, lockEntry: null, diagnostics };
  const lockEntry = lockEntryFor(entry, fetched, records, inventory.synthesized);
  return { ok: true, records, lockEntry, diagnostics };
}

function lockEntryFor(
  entry: CapabilityEntry,
  fetched: FetchedCapability,
  records: CapabilityRecord[],
  synthesized: boolean,
): LockEntry {
  const lockRecords = records.flatMap((record) =>
    record.lockRecord === undefined ? [] : [record.lockRecord],
  );
  const lockEntry: LockEntry = {
    capabilityHash: entryCapabilityHash(lockRecords) ?? emptyTreeHash(),
    capabilityNames: records.map((record) => record.name).sort(),
    selectorsByCapability: Object.fromEntries(
      records.map((record) => [record.name, record.selector]),
    ),
    source: sourceString(entry.source),
    sourceId: fetched.sourceId,
  };
  if (entry.capabilities !== undefined) lockEntry.capabilities = entry.capabilities;
  if (entry.except !== undefined) lockEntry.except = entry.except;
  if (entry.exclude !== undefined) lockEntry.exclude = entry.exclude;
  if (entry.format !== undefined) lockEntry.format = entry.format;
  if (entry.include !== undefined) lockEntry.include = entry.include;
  if (entry.only !== undefined) lockEntry.only = entry.only;
  if (entry.ref !== undefined) lockEntry.ref = entry.ref;
  if (entry.rename !== undefined) lockEntry.rename = entry.rename;
  if (synthesized) lockEntry.synthesized = true;
  lockEntry.resolvedCapabilities = lockRecords;
  lockEntry.resolvedAt = new Date().toISOString();
  if (fetched.commit !== null) lockEntry.resolvedSha = fetched.commit;
  return lockEntry;
}

async function materializeImportedSkill(
  candidate: SourceCapabilityCandidate,
  destination: string,
  revision: string | null,
): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  // Leave out notices caplet itself emitted, so a target directory read back as a source
  // does not carry them into the snapshot.
  await copySnapshot(candidate.root, path.join(destination, "skills", candidate.name), {
    exclude: (relativePath) => path.posix.basename(relativePath) === "ACF-MANAGED.md",
  });
  const version = `0.0.0-unmanifested+${revision ?? "local"}`;
  await writeFile(
    path.join(destination, "acf.yml"),
    `acf: 1\nname: ${candidate.name}\nversion: ${version}\n`,
    "utf8",
  );
  await writeFile(
    path.join(destination, IMPORT_MARKER_FILENAME),
    `${JSON.stringify({ acf: 1, synthesized: true, sourcePath: candidate.sourcePath })}\n`,
    "utf8",
  );
}

/** Package root of `candidate` relative to the source root (before `path:`), POSIX. */
function selectedSourcePath(entry: CapabilityEntry, candidate: SourceCapabilityCandidate): string {
  const entryPath = path.posix.normalize((entry.path ?? ".").replaceAll("\\", "/"));
  return path.posix.join(entryPath, candidate.sourcePath);
}

function finalCapabilityName(entry: CapabilityEntry, manifestName: string): string {
  if (typeof entry.rename === "string") return entry.rename;
  if (entry.rename !== undefined) return entry.rename[manifestName] ?? manifestName;
  return manifestName;
}

function snapshotRejectedDiagnostic(name: string, error: SnapshotRejectedError): Diagnostic {
  return {
    severity: "error",
    code: "acf.source.snapshot-rejected",
    message: `capability ${name}: ${error.message}`,
    data: { name, path: error.relativePath, reason: error.reason },
  };
}

/** Directory of the capability `name` under `capabilitiesDir`; throws unless `name` is a slug. */
export function capabilityPath(capabilitiesDir: string, name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`invalid capability destination name: ${name}`);
  }
  return path.join(capabilitiesDir, name);
}

function emptyTreeHash(): string {
  return "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
}
