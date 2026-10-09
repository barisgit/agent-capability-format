export * from "./executables.js";
export * from "./managed-notices.js";
export * from "./outcomes.js";

import { applicableTargets } from "../applicability/index.js";
import { familySupportFamilies, targetMap } from "../targets/index.js";
import type {
  AcfCapability,
  Diagnostic,
  FacetFamily,
  HookEntry,
  HookFile,
  McpFile,
  TargetId,
} from "../types/index.js";

export type {
  AcfManagedSidecar,
  AcfOwnership,
  EmitInput,
  EmitOptions,
  EmitResult,
  FileDiff,
} from "../types/index.js";

/**
 * `capability` reduced to what applies to `targetId` (SPEC.md §6), or null when the capability
 * itself does not apply. Families the target cannot carry add an `acf.adapter.facet-unsupported`
 * diagnostic to the returned capability.
 */
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
