import {
  type AcfCapability,
  capabilityCarrier,
  carriersOf,
  claudeLegacyFamilies,
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
    const configured = input.options.carrier ?? carriersOf("claude").default;
    if (capabilityCarrier(input.capability, "claude", configured) === "plugin") {
      const result = await emitClaudePlugin(input, fs);
      const ignored = ignoredSkillsOption(input);
      return ignored === undefined
        ? result
        : { ...result, diagnostics: [...result.diagnostics, ignored] };
    }
    if (configured === "plugin") {
      const result = await emitTarget(input, fs, target);
      const legacy = claudeLegacyFamilies(input.capability);
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

/**
 * `acf.claude.legacy-carrier` (info): the plugin carrier was configured, but `families` keep the
 * capability on loose files.
 */
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
 * `targets.claude.skills` places loose skill files; a plugin carries its skills inside the package,
 * so asking for the shared `.agents/skills` copy or no native copy has no effect there.
 */
function ignoredSkillsOption(input: EmitInput): Diagnostic | undefined {
  const skills = input.options.skills;
  if (input.capability.skills.length === 0) return undefined;
  if (skills?.canonical !== true && skills?.native !== false) return undefined;
  return {
    severity: "warn",
    code: "acf.claude.skills-option-ignored",
    message:
      "Claude plugins carry their skills inside the package, so targets.claude.skills has no effect on them; set targets.claude.carrier: loose to place skill files",
    targetId: "claude",
    capability: { name: input.capability.manifest.name },
    data: { skills },
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
