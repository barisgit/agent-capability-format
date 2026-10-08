import {
  type AcfCapability,
  applyApplicability,
  type Diagnostic,
  deduplicateCapabilities,
  resolveScopeCapabilities,
  type Scope,
  type TargetId,
} from "@caplet/core";
import { resolveCapabilities } from "@caplet/installer";
import { emitDiagnostics, throwOnErrorDiagnostics } from "./diagnostics.js";
import {
  type GetOptions,
  type NormalizedGetOptions,
  normalizeGetOptions,
  selectedScopeRoots,
  validateTarget,
} from "./options.js";
import { type FacetBundle, toFacetBundle } from "./views.js";

export type LoadedFacets = {
  capabilities: AcfCapability[];
  diagnostics: Diagnostic[];
  options: NormalizedGetOptions;
};

export async function getFacets(opts: GetOptions & { target: TargetId }): Promise<FacetBundle> {
  const loaded = await loadApplicableCapabilities(opts);
  return toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  });
}

export async function loadApplicableCapabilities(
  opts: GetOptions & { target: TargetId },
): Promise<LoadedFacets> {
  const options = normalizeGetOptions(opts);
  const targetDiagnostics = validateTarget(options.target);
  if (targetDiagnostics.length > 0) return finish([], targetDiagnostics, options);

  const roots = await selectedScopeRoots(options);
  const diagnostics: Diagnostic[] = [];
  const byScope: Record<Scope, AcfCapability[]> = { user: [], project: [] };

  for (const root of roots) {
    if (options.fetch !== "never") {
      const resolved = await resolveCapabilities({
        scope: root.scope,
        scopeRoot: root,
        mode: options.fetch,
      });
      diagnostics.push(...resolved.diagnostics);
    }
    const scoped = await resolveScopeCapabilities(root);
    byScope[root.scope].push(...scoped.capabilities);
    diagnostics.push(...scoped.diagnostics);
  }

  const scopedCapabilities = mergeScopes(options.scope, byScope, diagnostics);
  const filteredCapabilities = filterCapabilities(scopedCapabilities, options.capabilities);
  const applicable = filteredCapabilities.flatMap((capability) => {
    const applied = applyApplicability(capability, options.target);
    return applied === null ? [] : [applied];
  });
  diagnostics.push(...applicable.flatMap((capability) => capability.diagnostics));

  return finish(applicable, diagnostics, options);
}

function mergeScopes(
  scope: NormalizedGetOptions["scope"],
  byScope: Record<Scope, AcfCapability[]>,
  diagnostics: Diagnostic[],
): AcfCapability[] {
  if (scope === "user") return byScope.user;
  if (scope === "project") return byScope.project;
  const merged = deduplicateCapabilities(byScope.user, byScope.project);
  diagnostics.push(...merged.diagnostics);
  return merged.effective;
}

function filterCapabilities(
  capabilities: AcfCapability[],
  names: readonly string[] | undefined,
): AcfCapability[] {
  if (names === undefined) return capabilities;
  const keep = new Set(names);
  return capabilities.filter((capability) => keep.has(capability.manifest.name));
}

function finish(
  capabilities: AcfCapability[],
  diagnostics: Diagnostic[],
  options: NormalizedGetOptions,
): LoadedFacets {
  const uniqueDiagnostics = deduplicateDiagnostics(diagnostics);
  emitDiagnostics(uniqueDiagnostics);
  throwOnErrorDiagnostics(uniqueDiagnostics);
  return { capabilities, diagnostics: uniqueDiagnostics, options };
}

function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }
  return out;
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return JSON.stringify({
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    targetId: diagnostic.targetId,
    family: diagnostic.family,
    capability: diagnostic.capability,
    data: diagnostic.data,
  });
}
