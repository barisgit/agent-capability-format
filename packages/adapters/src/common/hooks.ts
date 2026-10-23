/** Safety gate for ACF hooks until per-host native writers can honor their semantics. */
import {
  type Diagnostic,
  type EmitInput,
  hookEntries,
  supportDiagnostic,
  type TargetId,
} from "@caplet/core";

/**
 * Refuses every applicable ACF hook, including ACF entries naming native events. These
 * records are not native handler objects. Never emit inert files or weaken a guard to
 * observe. Foreign Claude-plugin hook files bypass this gate as preserved native remainder.
 */
export function refuseHooks(input: EmitInput, target: TargetId, diagnostics: Diagnostic[]): void {
  for (const { entry } of hookEntries(input.capability.hooks)) {
    const diagnostic = supportDiagnostic(
      {
        capability: input.capability.manifest.name,
        target,
        carrier: "loose",
        family: "hook",
        component: entry.name,
      },
      "hook.run",
    );
    if (diagnostic !== undefined) diagnostics.push(diagnostic);
  }
}
