import type { CanonicalHookType, TargetId } from "@caplet/core";
import { loadApplicableCapabilities } from "./get-facets.js";
import type { GetOptions } from "./options.js";
import type { HookView } from "./views.js";
import { toFacetBundle } from "./views.js";

export async function getHooks(
  opts: GetOptions & { target: TargetId; hookType?: CanonicalHookType },
): Promise<HookView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  const hooks = toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).hooks;
  if (opts.hookType === undefined) return hooks;
  return hooks.filter((hook) => hook.hookType === opts.hookType);
}
