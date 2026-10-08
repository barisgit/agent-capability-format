import {
  type EmitInput,
  type EmitResult,
  extraDropped,
  extrasDialects,
  nativeExtras,
  nativeFileTargets,
  nativeTreeDropped,
  type ReadOnlyFs,
  type TargetDefinition,
} from "@caplet/core";
import { type AdapterOptions, emitStandardAdapter, layoutFor } from "./emitter.js";
import { emitMcp } from "./mcp.js";
import { emitSkills } from "./skills.js";
import type { EmitReport } from "./support-report.js";

/**
 * Emits one capability for one loose target: skills, then agents, commands, instructions and
 * hooks, then MCP servers. Writers report support decisions as diagnostics and translated
 * components in `outcomes`. Loose files have no package manifest and no package directory, so
 * every package-level native key and every `native/<target>/` tree is reported dropped.
 */
export async function emitTarget(
  input: EmitInput,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  options: AdapterOptions = {},
): Promise<EmitResult> {
  const report: EmitReport = { diagnostics: [], outcomes: [] };
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
  reportPackageDrops(input, target, report);
  return { diffs, diagnostics: report.diagnostics, outcomes: report.outcomes };
}

function reportPackageDrops(input: EmitInput, target: TargetDefinition, report: EmitReport): void {
  const capability = input.capability;
  const name = capability.manifest.name;
  const subject = {
    capability: name,
    target: target.id,
    carrier: "loose" as const,
    family: "package" as const,
    component: name,
  };
  const targets = capability.manifest.targets;
  for (const dialect of extrasDialects(targets))
    for (const key of Object.keys(nativeExtras(targets, dialect)))
      report.diagnostics.push(extraDropped(subject, { owner: dialect, key }));
  for (const owner of nativeFileTargets(capability))
    report.diagnostics.push(nativeTreeDropped({ capability: name, target: target.id }, owner));
}
