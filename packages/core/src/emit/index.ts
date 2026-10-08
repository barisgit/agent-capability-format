export * from "./managed-notices.js";
export * from "./outcomes.js";

import { applicableTargets } from "../applicability/index.js";
import { resolveScopeCapabilities } from "../resolver/index.js";
import { familySupportFamilies, targetIds, targetMap } from "../targets/index.js";
import type {
  AcfCapability,
  Diagnostic,
  EmitInput,
  EmitReport,
  EmitRequest,
  FacetFamily,
  HookEntry,
  HookFile,
  McpFile,
  ReadOnlyFs,
  Scope,
  TargetDefinition,
  TargetId,
} from "../types/index.js";

export type {
  AcfManagedSidecar,
  AcfOwnership,
  EmitInput,
  EmitOptions,
  EmitReport,
  EmitRequest,
  EmitResult,
  FileDiff,
} from "../types/index.js";

export async function emit(req: EmitRequest, fs: ReadOnlyFs): Promise<EmitReport> {
  const report: EmitReport = { perScopeTarget: {} };
  const requestedTargets = req.targets.length > 0 ? req.targets : [...targetIds];
  for (const scopeRoot of req.scopes) {
    const resolved = await resolveScopeCapabilities(scopeRoot);
    const capabilities = resolved.capabilities.sort(byCapabilityName);
    for (const targetId of requestedTargets) {
      const target = targetMap[targetId];
      if (target === undefined) {
        report.perScopeTarget[`${scopeRoot.scope}:${targetId}`] = {
          diffs: [],
          diagnostics: [
            {
              severity: "error",
              code: "acf.target.unknown-id",
              message: `unknown target id: ${targetId}`,
              targetId,
            },
          ],
        };
        continue;
      }
      const installRoot = resolveInstallRoot(target, scopeRoot.scope);
      if (installRoot === null) {
        report.perScopeTarget[`${scopeRoot.scope}:${targetId}`] = {
          diffs: [],
          diagnostics: [
            {
              severity: "lossy",
              code: "acf.adapter.scope-unsupported",
              message: `${targetId} does not support ${scopeRoot.scope} scope`,
              targetId,
            },
          ],
        };
        continue;
      }
      const diagnostics: Diagnostic[] = [...resolved.diagnostics];
      const diffs = [];
      for (const cap of capabilities) {
        const filtered = applyApplicability(cap, targetId);
        if (filtered === null) continue;
        const adapter = target.adapter;
        if (adapter === undefined) {
          diagnostics.push({
            severity: "lossy",
            code: "acf.adapter.not-registered",
            message: `adapter not registered for target ${targetId}`,
            targetId,
          });
          continue;
        }
        const input: EmitInput = {
          capability: filtered,
          scope: scopeRoot.scope,
          installRoot,
          options: req.options,
        };
        if (adapter.validate !== undefined) diagnostics.push(...(await adapter.validate(input)));
        const result = await adapter.emit(input, fs);
        diffs.push(...result.diffs);
        diagnostics.push(...result.diagnostics);
      }
      report.perScopeTarget[`${scopeRoot.scope}:${targetId}`] = {
        diffs: diffs.sort((a, b) => a.path.localeCompare(b.path)),
        diagnostics: diagnostics.sort(sortDiagnostics),
      };
    }
  }
  return report;
}

export function resolveInstallRoot(
  target: TargetDefinition<TargetId>,
  scope: Scope,
): string | null {
  return target.installPaths[scope];
}

export function applyApplicability(
  capability: AcfCapability,
  targetId: TargetId,
): AcfCapability | null {
  const capTargets = applicableTargets(capability, {});
  if (!capTargets.includes(targetId)) return null;
  const diagnostics: Diagnostic[] = [...capability.diagnostics];
  const skills = capability.skills.filter((facet) =>
    applicableTargets(capability, facet.frontmatter).includes(targetId),
  );
  const agents = capability.agents.filter((facet) =>
    applicableTargets(capability, facet.frontmatter).includes(targetId),
  );
  const commands = capability.commands.filter((facet) =>
    applicableTargets(capability, facet.frontmatter).includes(targetId),
  );
  const instructions = capability.instructions.filter((facet) =>
    applicableTargets(capability, facet.frontmatter).includes(targetId),
  );
  const hooks = filterHooks(capability, targetId);
  const mcp = filterMcp(capability, targetId);
  // Skills and MCP have no family-level gate; writers consult field-level support cells.
  for (const family of familySupportFamilies) {
    if (
      familyHasItems(family, {
        ...capability,
        skills,
        agents,
        commands,
        instructions,
        hooks,
        mcp,
      }) &&
      targetMap[targetId]?.support[family] === "none"
    ) {
      diagnostics.push({
        severity: "lossy",
        code: "acf.adapter.facet-unsupported",
        message: `${targetId} does not support ${family}`,
        targetId,
        family,
      });
    }
  }
  return { ...capability, skills, agents, commands, instructions, hooks, mcp, diagnostics };
}

function filterHooks(capability: AcfCapability, targetId: TargetId): HookFile | undefined {
  const hooks = capability.hooks;
  if (hooks === undefined) return undefined;
  const buckets: HookFile["buckets"] = {};
  for (const [type, entries] of Object.entries(hooks.buckets) as Array<
    [keyof HookFile["buckets"], HookEntry[] | undefined]
  >) {
    const kept = (entries ?? []).filter((entry) =>
      applicableTargets(capability, entry).includes(targetId),
    );
    if (kept.length > 0) buckets[type] = kept;
  }
  return { ...hooks, buckets };
}

function filterMcp(capability: AcfCapability, targetId: TargetId): McpFile | undefined {
  const mcp = capability.mcp;
  if (mcp === undefined) return undefined;
  const servers = mcp.servers.filter((server) =>
    applicableTargets(capability, server).includes(targetId),
  );
  return { ...mcp, servers };
}

function familyHasItems(
  family: FacetFamily,
  cap: Pick<AcfCapability, "skills" | "agents" | "commands" | "instructions" | "hooks" | "mcp">,
): boolean {
  switch (family) {
    case "skill":
      return cap.skills.length > 0;
    case "agent":
      return cap.agents.length > 0;
    case "command":
      return cap.commands.length > 0;
    case "instruction":
      return cap.instructions.length > 0;
    case "hook":
      return Object.values(cap.hooks?.buckets ?? {}).some((entries) => (entries?.length ?? 0) > 0);
    case "mcp":
      return (cap.mcp?.servers.length ?? 0) > 0;
  }
}

function byCapabilityName(a: AcfCapability, b: AcfCapability): number {
  return a.manifest.name.localeCompare(b.manifest.name);
}

function sortDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (a.path ?? "").localeCompare(b.path ?? "") || a.code.localeCompare(b.code);
}
