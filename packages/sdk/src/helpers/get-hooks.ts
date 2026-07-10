import type { CanonicalHookType, TargetId } from "@acf/core";
import { loadApplicableCapabilities } from "./get-facets";
import type { GetOptions } from "./options";
import type { HookView } from "./views";
import { toFacetBundle } from "./views";

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
