import type { ZodError, ZodIssue } from "zod";
import type { Diagnostic, FacetFamily, TargetId } from "../types/index.js";

export type { Diagnostic } from "../types/index.js";

export const ACF_DIAGNOSTIC_CODES = [
  "acf.manifest.invalid-name",
  "acf.manifest.acf-version-unknown",
  "acf.manifest.only-and-except",
  "acf.manifest.duplicate-file",
  "acf.capability.shadowed",
  "acf.capability.name-collision",
  "acf.facet.name-mismatch",
  "acf.facet.primary-missing",
  "acf.facet.duplicate",
  "acf.layout.singular-facet-folder",
  "acf.skill.shape.not-directory",
  "acf.instruction.debounce.requires-repeat-always",
  "acf.instruction.invalid-regex",
  "acf.applicability.empty",
  "acf.markdown.unknown-frontmatter-field",
  "acf.hooks.duplicate-file",
  "acf.hook.match.required",
  "acf.hook.effect.not-allowed",
  "acf.hook.run.args-and-shell",
  "acf.hook.target-native-event.unknown-schema",
  "acf.mcp.transport.missing-url",
  "acf.mcp.transport.missing-command",
  "acf.path.absolute",
  "acf.path.traversal",
  "acf.assets.missing",
  "acf.assets.unsupported",
  "acf.target.unknown-id",
  "acf.target.extension.unknown-field",
  "acf.adapter.scope-unsupported",
  "acf.adapter.effect-degraded",
  "acf.adapter.hook-event-unsupported",
  "acf.adapter.trigger-unsupported",
  "acf.adapter.mcp-unsupported",
  "acf.adapter.facet-unsupported",
  "acf.adapter.not-registered",
  "acf.adapter.superseded",
  "acf.scope.project-not-found",
  "acf.runtime.unknown-operation",
  "acf.runtime.case-folding",
  "acf.runtime.turn-granularity",
  "acf.runtime.family-unsupported",
  "acf.runtime.trigger-unsupported",
  "acf.taxonomy.operation.unmapped",
  "acf.capabilities-yml.source.unknown-scheme",
  "acf.capabilities-yml.duplicate-entry",
  "acf.resolve.capability-selector-direct-source",
  "acf.resolve.capability-selector-unmatched",
  "acf.lock.digest-mismatch",
  "acf.lock.drift",
  "acf.lock.missing-entry",
  "acf.lock.unsupported-version",
  "acf.source.snapshot-rejected",
  "acf.emit.drift",
  "acf.emit.managed-notice-reserved-path",
  "acf.emit.managed-notice-destination-collision",
  "acf.cli.partial-implementation",
  "acf.support.refused",
  "acf.support.degraded",
  "acf.support.component-omitted",
  "acf.extras.dropped",
  "acf.core.pending",
] as const;

export type AcfDiagnosticCode = (typeof ACF_DIAGNOSTIC_CODES)[number];

export function makeDiagnostic(input: {
  severity: Diagnostic["severity"];
  code: string;
  message: string;
  path?: string | undefined;
  location?: Diagnostic["location"] | undefined;
  targetId?: TargetId | undefined;
  family?: FacetFamily | undefined;
  data?: Record<string, unknown> | undefined;
}): Diagnostic {
  const diagnostic: Diagnostic = {
    severity: input.severity,
    code: input.code,
    message: input.message,
  };
  if (input.path !== undefined) diagnostic.path = input.path;
  if (input.location !== undefined) diagnostic.location = input.location;
  if (input.targetId !== undefined) diagnostic.targetId = input.targetId;
  if (input.family !== undefined) diagnostic.family = input.family;
  if (input.data !== undefined) diagnostic.data = input.data;
  return diagnostic;
}

export function pushZodIssues(
  diagnostics: Diagnostic[],
  error: ZodError,
  filePath?: string,
  options: { baseCode?: string; family?: FacetFamily } = {},
): void {
  for (const issue of error.issues) {
    diagnostics.push(
      makeDiagnostic({
        severity: "error",
        code: deriveZodCode(issue, options.baseCode),
        message: issue.message,
        path: filePath,
        family: options.family,
        data: { zodPath: issue.path.map(String), zodCode: issue.code },
      }),
    );
  }
}

function deriveZodCode(issue: ZodIssue, baseCode?: string): string {
  const message = issue.message.toLowerCase();
  const path = issue.path.map(String).join(".");
  if (message.includes("only and except")) return "acf.manifest.only-and-except";
  if (message.includes("debounce requires"))
    return "acf.instruction.debounce.requires-repeat-always";
  if (message.includes("invalid regex")) return "acf.instruction.invalid-regex";
  if (message.includes("args and shell")) return "acf.hook.run.args-and-shell";
  if (message.includes("requires command")) return "acf.mcp.transport.missing-command";
  if (message.includes("requires url")) return "acf.mcp.transport.missing-url";
  if (message.includes("unknown source scheme"))
    return "acf.capabilities-yml.source.unknown-scheme";
  if (issue.code === "unrecognized_keys") return "acf.capabilities-yml.unknown-key";
  if (path === "name" || path.endsWith(".name")) return "acf.manifest.invalid-name";
  if (path === "acf") return "acf.manifest.acf-version-unknown";
  return baseCode ?? `acf.schema.${path.length > 0 ? path.replaceAll(".", "-") : "invalid"}`;
}
