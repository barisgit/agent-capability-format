import type {
  AcfCapability,
  Diagnostic,
  FacetFamily,
  FacetSelector,
  TargetId,
} from "../types/index.js";
import { selectorKeys } from "../types/index.js";
import { applyEntrySelection, componentNames } from "./selection.js";

const families = Object.keys(selectorKeys) as FacetFamily[];

/**
 * Resolves cross-capability identity after selection and target applicability (SPEC §17.6).
 * Project capabilities/facets shadow user ones only in the project-merged effective view
 * (`capabilities`). `scopedCapabilities` preserves each scope's selection for emission: project
 * context must not change global user output. Same-scope clashes are errors even when shadowed.
 * Neither view mutates the inputs.
 */
export function resolveFacetCollisions(
  capabilities: readonly AcfCapability[],
  targetId: TargetId,
): {
  capabilities: AcfCapability[];
  scopedCapabilities: AcfCapability[];
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const projectNames = new Set(
    capabilities.filter((cap) => cap.scope === "project").map((cap) => cap.manifest.name),
  );
  const projectFacets = new Map<string, string>();
  for (const cap of capabilities.filter((cap) => cap.scope === "project")) {
    for (const family of families) {
      for (const name of componentNames(cap, family, targetId))
        projectFacets.set(`${family}\0${name}`, cap.manifest.name);
    }
  }
  const effective = capabilities.flatMap((cap) => {
    if (cap.scope !== "user") return [cap];
    if (projectNames.has(cap.manifest.name)) {
      diagnostics.push({
        severity: "info",
        code: "acf.capability.shadowed",
        targetId,
        message: `project capability ${cap.manifest.name} shadows user capability`,
        data: { name: cap.manifest.name },
      });
      return [];
    }
    const exclude: FacetSelector = {};
    for (const family of families) {
      const shadowed = componentNames(cap, family, targetId).filter((name) => {
        const project = projectFacets.get(`${family}\0${name}`);
        if (project === undefined) return false;
        diagnostics.push({
          severity: "info",
          code: "acf.facet.shadowed",
          targetId,
          family,
          message: `project capability ${project} shadows user capability ${cap.manifest.name} ${family} ${name}`,
          data: { name, project, user: cap.manifest.name },
        });
        return true;
      });
      if (shadowed.length > 0) exclude[selectorKeys[family]] = shadowed;
    }
    if (Object.keys(exclude).length === 0) return [cap];
    // These exclusions describe precedence, not actual removal from the user's package.
    // Selection lossiness (native remainder references) would falsely gate scoped emission;
    // genuine manifest include/exclude diagnostics are reported during scope resolution.
    return [applyEntrySelection(cap, { exclude }).capability];
  });
  diagnostics.push(...sameScopeFacetDiagnostics(capabilities, targetId));
  return { capabilities: effective, scopedCapabilities: [...capabilities], diagnostics };
}

/** All owners of a same-scope facet are reported together, independent of input order. */
function sameScopeFacetDiagnostics(
  capabilities: readonly AcfCapability[],
  targetId: TargetId,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const family of families) {
    const owners = new Map<string, { name: string; capabilities: AcfCapability[] }>();
    for (const cap of capabilities) {
      for (const name of new Set(componentNames(cap, family, targetId))) {
        const key = `${cap.scope}\0${name}`;
        const entry = owners.get(key) ?? { name, capabilities: [] };
        entry.capabilities.push(cap);
        owners.set(key, entry);
      }
    }
    for (const { name, capabilities: ownersOfFacet } of owners.values()) {
      if (ownersOfFacet.length < 2) continue;
      const names = ownersOfFacet.map((cap) => cap.manifest.name).sort();
      diagnostics.push({
        severity: "error",
        code: "acf.facet.name-collision",
        targetId,
        family,
        message: `${family} ${name} collides across capabilities ${names.join(", ")}; resolve with exclude: { ${selectorKeys[family]}: [${name}] } on one source entry`,
        data: { name, scope: ownersOfFacet[0]?.scope, capabilities: names },
      });
    }
  }
  return diagnostics;
}
