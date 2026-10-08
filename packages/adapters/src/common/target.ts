import type { EmitInput, EmitResult, ReadOnlyFs, TargetDefinition } from "@caplet/core";
import { type AdapterOptions, emitStandardAdapter, layoutFor } from "./emitter.js";
import { emitSkills, type SkillEmitReport } from "./skills.js";

/**
 * Emits one capability for one loose target: skills, then agents, commands, instructions,
 * hooks and MCP servers. Writers report support decisions as diagnostics and translated
 * components in `outcomes`.
 */
export async function emitTarget(
  input: EmitInput,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  options: AdapterOptions = {},
): Promise<EmitResult> {
  const report: SkillEmitReport = { diagnostics: [], outcomes: [] };
  const diffs = [
    ...(await emitSkills(input, fs, target, report)),
    ...(await emitStandardAdapter(
      input,
      fs,
      layoutFor(target.id, input.installRoot, input.scope),
      report.diagnostics,
      options,
    )),
  ];
  return { diffs, diagnostics: report.diagnostics, outcomes: report.outcomes };
}
