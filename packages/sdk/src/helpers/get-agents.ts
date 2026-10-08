import type { TargetId } from "@caplet/core";
import { loadApplicableCapabilities } from "./get-facets";
import type { GetOptions } from "./options";
import type { AgentView } from "./views";
import { toFacetBundle } from "./views";

export async function getAgents(opts: GetOptions & { target: TargetId }): Promise<AgentView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  return toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).agents;
}
