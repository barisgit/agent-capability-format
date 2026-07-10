import type { TargetId } from "@acf/core";
import { loadApplicableCapabilities } from "./get-facets";
import type { GetOptions } from "./options";
import type { McpServerView } from "./views";
import { toFacetBundle } from "./views";

export async function getMcpServers(
  opts: GetOptions & { target: TargetId },
): Promise<McpServerView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  return toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).mcpServers;
}
