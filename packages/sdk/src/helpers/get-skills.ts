import type { TargetId } from "@caplet/core";
import { loadApplicableCapabilities } from "./get-facets.js";
import type { GetOptions } from "./options.js";
import type { SkillView } from "./views.js";
import { toFacetBundle } from "./views.js";

export async function getSkills(opts: GetOptions & { target: TargetId }): Promise<SkillView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  return toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).skills;
}
