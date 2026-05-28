import "@acf/adapters";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  applyApplicability,
  readCapletConfig,
  resolveScopeCapabilities,
  targetIds,
  targetMap,
  type AcfCapability,
  type CapletConfig,
  type Diagnostic,
  type FileDiff,
  type ScopeRoot,
  type TargetId,
} from "@acf/core";
import { resolveCapabilities, type ResolveResult } from "@acf/installer";
import { applyDiffs, type ApplyResult } from "../apply/apply-diffs";
import { detectDrift, readSidecar } from "../apply/sidecar";
import { readCwd, readOptionalString, readScope, validationError, type FetchMode } from "./args";
import { diskReadOnlyFs } from "./fs";
import { resolveScopeRoots } from "./scopes";

export type EmittedDiff = {
  scopeRoot: ScopeRoot;
  targetId: TargetId;
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

export async function fetchScopes(
  args: Record<string, unknown>,
  mode: FetchMode,
): Promise<{ scopes: ScopeRoot[]; results: ResolveResult[]; diagnostics: Diagnostic[] }> {
  const cwd = path.resolve(readCwd(args));
  process.chdir(cwd);
  const scopes = await resolveScopeRoots(readScope(args), cwd);
  const results: ResolveResult[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const scopeRoot of scopes) {
    await mkdir(scopeRoot.agentsDir, { recursive: true });
    const result = await resolveCapabilities({ scope: scopeRoot.scope, scopeRoot, mode });
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
  const diffs: EmittedDiff[] = [];
  const fs = diskReadOnlyFs();

  for (const scopeRoot of scopes) {
    const resolved = await resolveScopeCapabilities(scopeRoot);
    diagnostics.push(...resolved.diagnostics);
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
        const input = { capability: filtered, scope: scopeRoot.scope, installRoot, options: {} };
        if (adapter.validate !== undefined) diagnostics.push(...(await adapter.validate(input)));
        const result = await adapter.emit(input, fs);
        diagnostics.push(...result.diagnostics);
        for (const diff of result.diffs) {
          if (diff.before === diff.after) continue;
          diffs.push({
            scopeRoot,
            targetId,
            installRoot,
            capabilityName: filtered.manifest.name,
            diff,
          });
        }
      }
    }
  }
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

export function summarizeDiffs(diffs: readonly EmittedDiff[]): string[] {
  return diffs.map((item) => {
    const action = item.diff.after === null ? "delete" : item.diff.before === null ? "create" : "update";
    return `${action} ${item.diff.path} (${item.scopeRoot.scope}:${item.targetId}:${item.capabilityName})`;
  });
}

export function capabilitySummary(capability: AcfCapability, targets: readonly TargetId[]): unknown {
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
  const values = requested === undefined ? (config.emit?.defaultTargets ?? [...targetIds]) : [requested];
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

async function driftDiagnostics(installRoot: string): Promise<Diagnostic[]> {
  const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
  return detectDrift(sidecar, {
    readText(relativePath) {
      try {
        return readFileSync(path.resolve(installRoot, relativePath), "utf8");
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
  });
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
