import "@acf/adapters";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type AcfCapability,
  applyApplicability,
  type CapletConfig,
  type Diagnostic,
  type EmitOptions,
  type FileDiff,
  readCapletConfig,
  resolveScopeCapabilities,
  type ScopeRoot,
  type TargetId,
  targetIds,
  targetMap,
} from "@acf/core";
import {
  detectLockDrift,
  type ResolveResult,
  readCapabilitiesYml,
  readLockfile,
  resolveCapabilities,
} from "@acf/installer";
import { type ApplyResult, applyDiffs } from "../apply/apply-diffs";
import { detectDrift, readSidecar } from "../apply/sidecar";
import { type FetchMode, readCwd, readOptionalString, readScope, validationError } from "./args";
import { diskReadOnlyFs } from "./fs";
import { addManagementNotices } from "./managed-notices";
import { resolveScopeRoots } from "./scopes";

export type EmittedDiff = {
  scopeRoot: ScopeRoot;
  targetId: TargetId;
  destination: "canonical" | "native";
  installRoot: string;
  capabilityName: string;
  diff: FileDiff;
};

export type EmitPlan = {
  config: CapletConfig;
  scopes: ScopeRoot[];
  targets: TargetId[];
  diagnostics: Diagnostic[];
  diffs: EmittedDiff[];
};

export type ApplySummary = { results: ApplyResult[]; diagnostics: Diagnostic[] };

export type DiffSummary = {
  action: "create" | "update" | "delete";
  path: string;
  context: string;
  count: number;
};

export async function fetchScopes(
  args: Record<string, unknown>,
  mode: FetchMode,
  capabilityName?: string,
): Promise<{ scopes: ScopeRoot[]; results: ResolveResult[]; diagnostics: Diagnostic[] }> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const results: ResolveResult[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const scopeRoot of scopes) {
    await mkdir(scopeRoot.agentsDir, { recursive: true });
    const sourceIds =
      capabilityName === undefined
        ? undefined
        : ((await readLockfile(scopeRoot.lockPath))?.entries
            .filter((entry) => entry.capabilityNames.includes(capabilityName))
            .map((entry) => entry.sourceId) ?? []);
    const result = await resolveCapabilities({
      scope: scopeRoot.scope,
      scopeRoot,
      mode,
      sourceIds,
    });
    results.push(result);
    diagnostics.push(...result.diagnostics);
  }
  return { scopes, results, diagnostics };
}

export async function buildEmitPlan(args: Record<string, unknown>): Promise<EmitPlan> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const configResult = await readCapletConfig(cwd);
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const targets = targetSelection(args, configResult.config);
  const diagnostics: Diagnostic[] = [...configResult.diagnostics];
  const desiredDiffs: EmittedDiff[] = [];
  const canonicalDiffs = new Set<string>();
  const fs = diskReadOnlyFs();

  for (const scopeRoot of scopes) {
    const manifest = await readCapabilitiesYml(scopeRoot.manifestPath);
    diagnostics.push(...manifest.diagnostics);
    diagnostics.push(...detectLockDrift(manifest.value, await readLockfile(scopeRoot.lockPath)));
    const resolved = await resolveScopeCapabilities(scopeRoot);
    diagnostics.push(...resolved.diagnostics);
    diagnostics.push(...(await driftDiagnostics(scopeRoot.agentsDir)));
    for (const targetId of targets) {
      const installRoot = installRootFor(targetId, scopeRoot, configResult.config, cwd);
      if (installRoot === null) {
        diagnostics.push({
          severity: "lossy",
          code: "acf.adapter.scope-unsupported",
          message: `${targetId} does not support ${scopeRoot.scope} scope`,
          targetId,
        });
        continue;
      }
      diagnostics.push(...(await driftDiagnostics(installRoot)));
      for (const capability of resolved.capabilities) {
        const filtered = applyApplicability(capability, targetId);
        if (filtered === null) continue;
        const adapter = targetMap[targetId]?.adapter;
        if (adapter === undefined) {
          diagnostics.push({
            severity: "lossy",
            code: "acf.adapter.not-registered",
            message: `adapter not registered for target ${targetId}`,
            targetId,
          });
          continue;
        }
        const input = {
          capability: filtered,
          scope: scopeRoot.scope,
          installRoot,
          options: emitOptionsForTarget(targetId, configResult.config),
        };
        if (adapter.validate !== undefined) diagnostics.push(...(await adapter.validate(input)));
        const result = await adapter.emit(input, fs);
        diagnostics.push(...result.diagnostics);
        for (const diff of result.diffs) {
          const canonical = isCanonicalSkillPath(diff.path, scopeRoot);
          if (canonical) {
            const key = `${scopeRoot.scope}\0${filtered.manifest.name}\0${path.resolve(diff.path)}`;
            if (canonicalDiffs.has(key)) continue;
            canonicalDiffs.add(key);
          }
          desiredDiffs.push({
            scopeRoot,
            targetId,
            destination: canonical ? "canonical" : "native",
            installRoot: canonical ? scopeRoot.agentsDir : installRoot,
            capabilityName: filtered.manifest.name,
            diff,
          });
        }
      }
    }
  }
  const desiredWithNotices = await addManagementNotices(desiredDiffs, fs, diagnostics);
  const diffs = desiredWithNotices.filter((item) => fileDiffChanged(item.diff));
  return { config: configResult.config, scopes, targets, diagnostics, diffs };
}

export async function applyEmitPlan(plan: EmitPlan): Promise<ApplySummary> {
  const results: ApplyResult[] = [];
  for (const group of groupByApplyTarget(plan.diffs)) {
    const result = await applyDiffs(group.diffs, {
      installRoot: group.installRoot,
      capabilityName: group.capabilityName,
      sidecarPath: path.join(group.installRoot, ".acf-managed.json"),
    });
    results.push(result);
  }
  return { results, diagnostics: plan.diagnostics };
}

const COLLAPSE_THRESHOLD = 5;

export function describeDiffs(
  diffs: readonly EmittedDiff[],
  options?: { expand?: boolean },
): DiffSummary[] {
  type Entry = DiffSummary & {
    scope: string;
    target: string;
    capabilities: string[];
    noticeCount: number;
  };
  const groups = new Map<string, Entry>();
  for (const item of diffs) {
    const action =
      item.diff.after === null ? "delete" : item.diff.before === null ? "create" : "update";
    const notice = item.diff.managementNotice !== undefined;
    const display = notice ? "Management notices" : displayPath(item.diff.path);
    const destination = item.destination === "canonical" ? "canonical" : item.targetId;
    const key = `${action}\u0000${display}\u0000${item.scopeRoot.scope}\u0000${destination}`;
    const group: Entry = groups.get(key) ?? {
      action,
      path: display,
      context: "",
      count: 0,
      scope: item.scopeRoot.scope,
      target: destination,
      capabilities: [],
      noticeCount: 0,
    };
    if (notice) group.noticeCount += 1;
    if (
      item.capabilityName !== ACF_SYSTEM_OWNER &&
      !group.capabilities.includes(item.capabilityName)
    ) {
      group.capabilities.push(item.capabilityName);
    }
    groups.set(key, group);
  }
  const buckets = new Map<string, Entry[]>();
  for (const entry of groups.values()) {
    const key = [
      entry.action,
      entry.scope,
      entry.target,
      entry.noticeCount === 0 ? "file" : "notice",
      [...entry.capabilities].sort().join(","),
    ].join("\u0000");
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  const result: DiffSummary[] = [];
  for (const bucket of buckets.values()) {
    const collapse =
      options?.expand !== true &&
      bucket.length > COLLAPSE_THRESHOLD &&
      bucket[0]?.noticeCount === 0;
    if (collapse) {
      const first = bucket[0] as Entry;
      result.push({
        action: first.action,
        path: `${commonDirectory(bucket.map((entry) => entry.path))} (${bucket.length} files)`,
        count: bucket.length,
        context: [
          first.scope,
          first.target,
          ...(first.capabilities.length === 0 ? [] : [[...first.capabilities].sort().join(", ")]),
        ].join(" / "),
      });
      continue;
    }
    for (const group of bucket) {
      result.push({
        action: group.action,
        path: group.path,
        count: group.noticeCount === 0 ? 1 : group.noticeCount,
        context: [
          group.scope,
          group.target,
          ...(group.noticeCount === 0 ? [] : [`${group.noticeCount} files`]),
          ...(group.capabilities.length === 0 ? [] : [group.capabilities.sort().join(", ")]),
        ].join(" / "),
      });
    }
  }
  return result;
}

function commonDirectory(paths: readonly string[]): string {
  const segmentLists = paths.map((entry) => entry.split(path.sep).slice(0, -1));
  const first = segmentLists[0] ?? [];
  const shared: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index] as string;
    if (!segmentLists.every((segments) => segments[index] === segment)) break;
    shared.push(segment);
  }
  return shared.length === 0 ? "." : `${shared.join(path.sep)}${path.sep}`;
}

export function countPresentedFiles(changes: readonly DiffSummary[]): number {
  return changes.reduce((sum, change) => sum + change.count, 0);
}

function displayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  if (relative.length > 0 && !relative.startsWith("..")) return relative;
  const home = os.homedir();
  if (filePath === home || filePath.startsWith(`${home}${path.sep}`)) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}

function isCanonicalSkillPath(filePath: string, scopeRoot: ScopeRoot): boolean {
  const root = path.resolve(scopeRoot.agentsDir, "skills");
  const candidate = path.resolve(filePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function capabilitySummary(
  capability: AcfCapability,
  targets: readonly TargetId[],
): unknown {
  return {
    name: capability.manifest.name,
    version: capability.manifest.version,
    scope: capability.scope,
    root: capability.root,
    facets: {
      skills: capability.skills.map((facet) => facet.name),
      agents: capability.agents.map((facet) => facet.name),
      commands: capability.commands.map((facet) => facet.name),
      instructions: capability.instructions.map((facet) => facet.name),
      hooks: Object.keys(capability.hooks?.buckets ?? {}),
      mcp: capability.mcp?.servers.map((server) => server.name) ?? [],
    },
    applicability: Object.fromEntries(
      targets.map((targetId) => [targetId, applyApplicability(capability, targetId) !== null]),
    ),
    diagnostics: capability.diagnostics,
  };
}

export function targetSelection(args: Record<string, unknown>, config: CapletConfig): TargetId[] {
  const requested = readOptionalString(args, "target");
  const values =
    requested === undefined ? (config.emit?.defaultTargets ?? [...targetIds]) : [requested];
  const out: TargetId[] = [];
  for (const value of values) {
    if (!targetIds.includes(value)) throw validationError(`unknown target: ${value}`);
    if (config.targets?.[value]?.disabled === true) continue;
    out.push(value);
  }
  return out;
}

export function installRootFor(
  targetId: TargetId,
  scopeRoot: ScopeRoot,
  config: CapletConfig,
  cwd: string,
): string | null {
  const configured = config.targets?.[targetId]?.out?.[scopeRoot.scope];
  const target = targetMap[targetId];
  const candidate = configured ?? target?.installPaths[scopeRoot.scope] ?? null;
  if (candidate === null) return null;
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function emitOptionsForTarget(targetId: TargetId, config: CapletConfig): EmitOptions {
  const options: EmitOptions = {};
  const skills = config.targets?.[targetId]?.skills;
  if (skills !== undefined) options.skills = skills;
  return options;
}

async function driftDiagnostics(installRoot: string): Promise<Diagnostic[]> {
  const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
  return detectDrift(sidecar, {
    readText(relativePath) {
      try {
        return readFileSync(path.resolve(installRoot, relativePath), "utf8");
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },
    readBytes(relativePath) {
      try {
        return readFileSync(path.resolve(installRoot, relativePath));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },
  });
}

function fileDiffChanged(diff: FileDiff): boolean {
  if (diff.beforeMode !== diff.afterMode) {
    const hasMode = diff.beforeMode !== undefined || diff.afterMode !== undefined;
    if (hasMode) return true;
  }
  const { before, after } = diff;
  if (before === null || after === null) return before !== after;
  if (typeof before === "string" || typeof after === "string") return before !== after;
  return before.length !== after.length || before.some((byte, index) => byte !== after[index]);
}

type ApplyGroup = { installRoot: string; capabilityName: string; diffs: FileDiff[] };

function groupByApplyTarget(items: readonly EmittedDiff[]): ApplyGroup[] {
  const groups = new Map<string, ApplyGroup>();
  for (const item of items) {
    const key = `${item.installRoot}\0${item.capabilityName}`;
    const group = groups.get(key) ?? {
      installRoot: item.installRoot,
      capabilityName: item.capabilityName,
      diffs: [],
    };
    group.diffs.push(item.diff);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    `${a.installRoot}:${a.capabilityName}`.localeCompare(`${b.installRoot}:${b.capabilityName}`),
  );
}
