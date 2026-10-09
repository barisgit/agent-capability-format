/**
 * Claude retention planning: what becomes of the earlier Claude plugin of a capability the scope
 * still selects for Claude when its writer gives it no plugin.
 */
import type { AcfCapability, EmitResult, Scope } from "@caplet/core";
import type { HeldClaudePlugin, PluginlessClaudeCapability } from "./workflow.js";

/** What the plan collects about Claude plugins it keeps or retires for selected capabilities. */
export type ClaudeRetention = {
  /** Selected capabilities whose installed Claude plugin stays as it is. */
  heldClaude: HeldClaudePlugin[];
  /** Selected capabilities that get no Claude plugin; their earlier plugin keeps Claude's data. */
  pluginlessClaude: PluginlessClaudeCapability[];
  /**
   * `<install root>\0<capability>` pairs whose sidecar entries a blocked or held capability keeps.
   */
  keptOutput: Set<string>;
};

/**
 * Records in `retention` what becomes of the earlier Claude plugin of `capability`, which `scope`
 * still selects for Claude, when the writer's `result` gives it none. It stays as it is when the
 * capability's reader left out an invalid component (design D27.4) and nothing else of it reaches
 * Claude, because an invalid value is no deselection; otherwise it is retired keeping what Claude
 * saved for it. A capability that gets a plugin records nothing.
 */
export function planClaudeRetention(
  retention: ClaudeRetention,
  scope: Scope,
  installRoot: string,
  capability: AcfCapability,
  result: EmitResult,
): void {
  if ((result.plugins ?? []).length > 0) return;
  const name = capability.manifest.name;
  if (result.diffs.length === 0 && readerLeftOutComponent(capability)) {
    retention.heldClaude.push({ scope, capability: name });
    retention.keptOutput.add(`${installRoot}\u0000${name}`);
    return;
  }
  const output = result.diffs.length === 0 ? "empty" : "loose";
  retention.pluginlessClaude.push({ scope, capability: name, output });
}

/** Whether a reader left out a component of `capability` (`acf.source.component-invalid`). */
function readerLeftOutComponent(capability: AcfCapability): boolean {
  return (
    capability.source?.projected?.incomplete === true ||
    capability.diagnostics.some((item) => item.code === "acf.source.component-invalid")
  );
}
