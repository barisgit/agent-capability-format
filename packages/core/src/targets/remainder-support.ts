/**
 * Support decisions for a foreign package's native remainder on targets that do not write its
 * format (capability-model-layers, Component omission).
 */
import type {
  AcfCapability,
  Diagnostic,
  FacetFamily,
  NativeRemainderComponent,
  NativeRemainderKind,
  TargetId,
} from "../types/index.js";
import { componentOmitted, packageRefused } from "./support-diagnostics.js";

/**
 * Targets that receive a foreign format's native remainder: only the writer of the same format
 * copies it. The Agent Plugins writer is a follow-up change, so its remainder reaches no target
 * yet.
 */
export const remainderTargets: Readonly<
  Record<NativeRemainderComponent["format"], readonly TargetId[]>
> = {
  "claude-plugin": ["claude"],
  "agent-plugins": [],
};

const formatNames: Readonly<Record<NativeRemainderComponent["format"], string>> = {
  "claude-plugin": "Claude plugin",
  "agent-plugins": "Agent Plugins",
};

/** Remainder kinds that are a component of an ACF family, and so appear in the plan report. */
const remainderFamilies: Partial<Record<NativeRemainderKind, FacetFamily>> = {
  agent: "agent",
  command: "command",
  hook: "hook",
  "mcp-server": "mcp",
};

/**
 * Diagnostics for the native remainder of `capability` on `target` when the target does not
 * write the remainder's format ({@link remainderTargets}): a restricting component refuses the
 * whole package (`acf.support.refused`), since dropping it would run the package without the
 * restriction; any other component is omitted with a lossy `acf.support.component-omitted`,
 * reported under its ACF family or, for kinds outside them (settings, output styles, LSP
 * servers, ...), under the `remainder` outcome family. Empty for a target that carries the
 * remainder.
 */
export function remainderSupport(capability: AcfCapability, target: TargetId): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const component of capability.remainder ?? []) {
    if (remainderTargets[component.format].includes(target)) continue;
    const family = remainderFamilies[component.kind];
    const format = formatNames[component.format];
    const subject = { capability: capability.manifest.name, target };
    if (component.class === "restricting") {
      diagnostics.push(
        family === undefined
          ? packageRefused(
              { ...subject, family: "package", component: capability.manifest.name },
              `restricts behavior through its ${format} ${component.kind} ${component.name}, which ${target} cannot carry`,
            )
          : packageRefused(
              { ...subject, family, component: component.name },
              `is a restricting ${format} ${component.kind} that ${target} cannot carry`,
            ),
      );
    } else if (family !== undefined) {
      diagnostics.push(
        componentOmitted(
          { ...subject, family, component: component.name },
          `${target} does not translate ${format} ${component.kind}s`,
        ),
      );
    } else {
      diagnostics.push(
        componentOmitted(
          { ...subject, family: "remainder", component: component.name },
          `${target} does not carry ${format} ${component.kind} components`,
          `${format} ${component.kind}`,
        ),
      );
    }
  }
  return diagnostics;
}

/** Whether the native remainder of `capability` refuses the whole package on `target`. */
export function remainderRefuses(capability: AcfCapability, target: TargetId): boolean {
  return remainderSupport(capability, target).some(
    (diagnostic) => diagnostic.code === "acf.support.refused",
  );
}
