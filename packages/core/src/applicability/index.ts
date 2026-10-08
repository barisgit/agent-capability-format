import { targetIds } from "../targets/index.js";
import type { AcfCapability, Diagnostic, TargetId } from "../types/index.js";

export type ApplicabilityDecl = { only?: TargetId[] | undefined; except?: TargetId[] | undefined };

export function computeSet(
  decl: ApplicabilityDecl,
  all: readonly TargetId[] = targetIds,
): TargetId[] {
  if (decl.only !== undefined) return all.filter((id) => decl.only?.includes(id) === true);
  if (decl.except !== undefined) return all.filter((id) => decl.except?.includes(id) !== true);
  return [...all];
}

export function applicableTargets(cap: AcfCapability, facet: ApplicabilityDecl): TargetId[] {
  const capSet = computeSet(cap.manifest, targetIds);
  if (facet.only === undefined && facet.except === undefined) return capSet;
  const facetSet = computeSet(facet, targetIds);
  return capSet.filter((id) => facetSet.includes(id));
}

export function validateApplicabilityDecl(
  decl: ApplicabilityDecl,
  diagnostics: Diagnostic[],
  path?: string,
): void {
  if (decl.only !== undefined && decl.except !== undefined) {
    diagnostics.push({
      severity: "error",
      code: "acf.manifest.only-and-except",
      message: "only and except are mutually exclusive",
      ...(path !== undefined ? { path } : {}),
    });
  }
}
