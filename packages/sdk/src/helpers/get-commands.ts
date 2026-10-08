import type { TargetId } from "@caplet/core";
import { loadApplicableCapabilities } from "./get-facets";
import type { GetOptions } from "./options";
import type { CommandView } from "./views";
import { toFacetBundle } from "./views";

export async function getCommands(opts: GetOptions & { target: TargetId }): Promise<CommandView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  return toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).commands;
}
