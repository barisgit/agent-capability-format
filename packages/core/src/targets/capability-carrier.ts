/**
 * The carrier a capability goes out on for a target: the configured `targets.<t>.carrier`, else
 * the target's default, except that the Claude plugin writer does not generate every component
 * family yet, so a capability with one of those stays whole on loose files.
 */
import type { AcfCapability, Carrier, TargetId } from "../types/index.js";
import { carriersOf } from "./field-support.js";

/**
 * The component families of `capability` that the Claude plugin writer does not generate yet
 * (agents, commands, hooks, instructions); any of them keeps the capability on loose files.
 */
export function claudeLegacyFamilies(capability: AcfCapability): string[] {
  const families: string[] = [];
  if (capability.agents.length > 0) families.push("agents");
  if (capability.commands.length > 0) families.push("commands");
  if (
    capability.hooks !== undefined &&
    Object.values(capability.hooks.buckets).some((entries) => (entries?.length ?? 0) > 0)
  )
    families.push("hooks");
  if (capability.instructions.length > 0) families.push("instructions");
  return families;
}

/**
 * The carrier `capability` (already filtered by applicability for `target`) is written on, given
 * the configured carrier. Emit and every report of what reaches a target share this decision.
 */
export function capabilityCarrier(
  capability: AcfCapability,
  target: TargetId,
  configured?: Carrier,
): Carrier {
  const carrier = configured ?? carriersOf(target).default;
  if (target === "claude" && carrier === "plugin" && claudeLegacyFamilies(capability).length > 0) {
    return "loose";
  }
  return carrier;
}
