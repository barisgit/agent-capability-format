import type { CanonicalTriggerName, TargetId } from "@caplet/core";
import { loadApplicableCapabilities } from "./get-facets.js";
import type { GetOptions } from "./options.js";
import type { InstructionView } from "./views.js";
import { matchesTrigger, toFacetBundle } from "./views.js";

export async function getInstructions(
  opts: GetOptions & { target: TargetId; trigger?: CanonicalTriggerName },
): Promise<InstructionView[]> {
  const loaded = await loadApplicableCapabilities(opts);
  const instructions = toFacetBundle(loaded.capabilities, {
    target: loaded.options.target,
    includeDiagnostics: loaded.options.includeDiagnostics,
  }).instructions;
  const trigger = opts.trigger;
  if (trigger === undefined) return instructions;
  return instructions.filter((instruction) => matchesTrigger(instruction, trigger));
}
