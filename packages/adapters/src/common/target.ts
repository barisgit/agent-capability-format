import {
  type EmitInput,
  type EmitResult,
  type ReadOnlyFs,
  remainderSupport,
  type TargetDefinition,
} from "@caplet/core";
import { type AdapterOptions, emitStandardAdapter, layoutFor } from "./emitter.js";
import { emitMcp } from "./mcp.js";
import { emitSkills } from "./skills.js";
import type { EmitReport } from "./support-report.js";

/**
 * Emits one capability for one loose target: skills, then agents, commands, instructions and
 * hooks, then MCP servers. A foreign package's native remainder is not written; it is omitted
 * or refuses the package (`remainderSupport`). Writers report support decisions as diagnostics
 * and translated components in `outcomes`.
 */
export async function emitTarget(
  input: EmitInput,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  options: AdapterOptions = {},
): Promise<EmitResult> {
  // A refusal here blocks the whole capability: the caller drops every diff below.
  const report: EmitReport = {
    diagnostics: remainderSupport(input.capability, target.id),
    outcomes: [],
  };
  const diffs = [
    ...(await emitSkills(input, fs, target, report)),
    ...(await emitStandardAdapter(
      input,
      fs,
      layoutFor(target.id, input.installRoot, input.scope),
      report.diagnostics,
      options,
    )),
    ...(await emitMcp(input, fs, target.id, report)),
  ];
  return { diffs, diagnostics: report.diagnostics, outcomes: report.outcomes };
}
