import {
  type AcfCapability,
  carriersOf,
  type Diagnostic,
  type EmitInput,
  packageRefused,
  type ReadOnlyFs,
  registerAdapter,
  type TargetAdapter,
  targetMap,
} from "@caplet/core";
import { emitTarget } from "../common/target.js";
import { emitClaudePlugin } from "./plugin.js";

const target = targetMap.claude;
if (target === undefined) throw new Error("missing target definition for claude");

/**
 * Claude writes each capability as a plugin by default and as loose files under `.claude/` on
 * `carrier: loose`. A native ACF capability with agents, commands, hooks or instructions stays
 * whole on loose files, which carry them today.
 */
export const claudeAdapter: TargetAdapter<"claude"> = {
  id: "claude",
  emit: async (input, fs: ReadOnlyFs) => {
    const carrier = input.options.carrier ?? carriersOf("claude").default;
    if (carrier === "plugin") {
      const legacy = legacyComponents(input.capability);
      if (legacy.length === 0) return await emitClaudePlugin(input, fs);
      const result = await emitTarget(input, fs, target);
      return {
        ...result,
        diagnostics: [legacyCarrier(input.capability, legacy), ...result.diagnostics],
      };
    }
    const refusal = looseRemainderRefusal(input);
    if (refusal !== undefined) return { diffs: [], diagnostics: [refusal], outcomes: [] };
    return await emitTarget(input, fs, target);
  },
};

registerAdapter("claude", claudeAdapter);

/** Component families the Claude plugin writer does not generate yet. */
function legacyComponents(capability: AcfCapability): string[] {
  const families: string[] = [];
  if (capability.agents.length > 0) families.push("agents");
  if (capability.commands.length > 0) families.push("commands");
  if (
    capability.hooks !== undefined &&
    Object.values(capability.hooks.buckets).some((entries) => (entries?.length ?? 0) > 0)
  )
    families.push("hooks");
  if (capability.instructions.length > 0) families.push("instructions");
  return families;
}

function legacyCarrier(capability: AcfCapability, families: readonly string[]): Diagnostic {
  return {
    severity: "info",
    code: "acf.claude.legacy-carrier",
    message:
      capability.manifest.name +
      " selects " +
      families.join(", ") +
      " for Claude, so the whole capability stays on loose .claude/ files instead of a plugin",
    targetId: "claude",
    capability: { name: capability.manifest.name },
    data: { families },
  };
}

/**
 * A Claude plugin source keeps its remainder only inside a plugin, so on loose files it is
 * refused for Claude rather than written without it.
 */
function looseRemainderRefusal(input: EmitInput): Diagnostic | undefined {
  const capability = input.capability;
  const remainder = capability.remainder ?? [];
  if (capability.source?.format !== "claude-plugin" || remainder.length === 0) return undefined;
  const name = capability.manifest.name;
  return packageRefused(
    { capability: name, target: "claude", carrier: "loose", family: "package", component: name },
    "has plugin components that loose Claude files cannot carry: " +
      remainder.map((c) => `${c.kind} ${c.name}`).join(", "),
    "targets.claude.carrier: plugin or except: [claude]",
  );
}
