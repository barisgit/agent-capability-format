import type { TargetId } from "@caplet/core";
import { loadApplicableCapabilities } from "./get-facets.js";
import type { GetOptions } from "./options.js";
import type { McpServerView } from "./views.js";
import { toFacetBundle } from "./views.js";

export async function getMcpServers(
  opts: GetOptions & { target: TargetId },
): Promise<McpServerView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  return toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).mcpServers;
}
