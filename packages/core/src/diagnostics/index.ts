import type { ZodError, ZodIssue } from "zod";
import type { Diagnostic, FacetFamily, TargetId } from "../types/index.js";

export type { Diagnostic } from "../types/index.js";

/**
 * Every diagnostic code the packages and the caplet CLI emit, plus codes SPEC.md reserves for
 * features not built yet. IMPLEMENTATION.md §11.2 documents each with its severity;
 * tests/diagnostics-coverage.test.ts fails when source emits an unregistered code or the two
 * lists diverge.
 */
export const ACF_DIAGNOSTIC_CODES = [
  "acf.schema.invalid-yaml",
  "acf.manifest.invalid-name",
  "acf.manifest.invalid-field",
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
  "acf.skill.placeholder-unexpanded",
  "acf.import.skill-description-missing",
  "acf.import.skill-frontmatter-invalid",
  "acf.instruction.debounce.requires-repeat-always",
  "acf.instruction.invalid-regex",
  "acf.applicability.empty",
  "acf.markdown.unknown-frontmatter-field",
  "acf.markdown.invalid-frontmatter-field",
  "acf.hooks.duplicate-file",
  "acf.hooks.invalid-field",
  "acf.hook.match.required",
  "acf.hook.effect.not-allowed",
  "acf.hook.run.args-and-shell",
  "acf.hook.target-native-event.unknown-schema",
  "acf.mcp.transport.missing-url",
  "acf.mcp.transport.missing-command",
  "acf.mcp.invalid-field",
  "acf.mcp.duplicate-file",
  "acf.mcp.cwd.invalid",
  "acf.mcp.url.insecure",
  "acf.mcp.url.credential-in-url",
  "acf.mcp.placeholder.unsupported",
  "acf.mcp.placeholder.pending",
  "acf.mcp.config-conflict",
  "acf.skill.paths-not-core",
  "acf.skill.native-key-not-core",
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
  "acf.capabilities-yml.unknown-key",
  "acf.capabilities-yml.invalid",
  "acf.caplet-yml.invalid",
  "acf.resolve.capability-selector-unmatched",
  "acf.resolve.no-capabilities",
  "acf.resolve.ref-required",
  "acf.prune.failed",
  "acf.lock.digest-mismatch",
  "acf.lock.drift",
  "acf.lock.missing-entry",
  "acf.lock.unsupported-version",
  "acf.source.snapshot-rejected",
  "acf.source.format-selected",
  "acf.source.format-not-found",
  "acf.source.format-version-unsupported",
  "acf.source.marketplace-unsupported",
  "acf.source.manifest-invalid",
  "acf.source.manifest-key-unknown",
  "acf.source.component-invalid",
  "acf.source.credential-in-url",
  "acf.emit.drift",
  "acf.emit.managed-notice-reserved-path",
  "acf.emit.managed-notice-destination-collision",
  "acf.apply.drift",
  "acf.apply.outside-root",
  "acf.claude.legacy-carrier",
  "acf.claude.plugin-file-ignored",
  "acf.claude.skills-option-ignored",
  "acf.claude.cli-unavailable",
  "acf.claude.state-unreadable",
  "acf.claude.command-failed",
  "acf.claude.policy-blocked",
  "acf.claude.version-mismatch",
  "acf.claude.other-scope",
  "acf.claude.marketplace-kept",
  "acf.migration.drifted",
  "acf.cli.partial-implementation",
  "acf.cli.usage",
  "acf.caplet.not-found",
  "acf.doctor.git-missing",
  "acf.doctor.agents-unreadable",
  "acf.doctor.target-unregistered",
  "acf.doctor.lockfile-invalid",
  "acf.support.refused",
  "acf.support.degraded",
  "acf.support.component-omitted",
  "acf.selection.unmatched",
  "acf.selection.remainder-references",
  "acf.extras.dropped",
  "acf.core.pending",
  "acf.extras.conflict",
  "acf.extras.unclassified",
  "acf.extras.package-value-invalid",
  "acf.extras.native-value-invalid",
  "acf.native.unknown-target",
  "acf.native.unsupported-entry",
  "acf.native.collision",
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

/**
 * Pushes one `error` per zod issue in `error`, coded by the issue. Only the caller knows which
 * file it parsed, so it names the file's codes: `baseCode` for an issue no more specific code
 * covers, `unknownKeyCode` for a key the file's schema does not allow, and `codeFor`, which
 * decides an issue's code ahead of every generic rule when it returns one. Typing them as
 * registered codes keeps every emitted code in {@link ACF_DIAGNOSTIC_CODES}.
 */
export function pushZodIssues(
  diagnostics: Diagnostic[],
  error: ZodError,
  filePath: string | undefined,
  options: {
    baseCode: AcfDiagnosticCode;
    unknownKeyCode?: AcfDiagnosticCode;
    family?: FacetFamily;
    codeFor?: (issue: ZodIssue) => AcfDiagnosticCode | undefined;
  },
): void {
  for (const issue of error.issues) {
    diagnostics.push(
      makeDiagnostic({
        severity: "error",
        code: options.codeFor?.(issue) ?? deriveZodCode(issue, options),
        message: issue.message,
        path: filePath,
        family: options.family,
        data: { zodPath: issue.path.map(String), zodCode: issue.code },
      }),
    );
  }
}

function deriveZodCode(
  issue: ZodIssue,
  { baseCode, unknownKeyCode }: { baseCode: AcfDiagnosticCode; unknownKeyCode?: AcfDiagnosticCode },
): AcfDiagnosticCode {
  const message = issue.message.toLowerCase();
  if (message.includes("only and except")) return "acf.manifest.only-and-except";
  if (message.includes("debounce requires"))
    return "acf.instruction.debounce.requires-repeat-always";
  if (message.includes("invalid regex")) return "acf.instruction.invalid-regex";
  if (message.includes("args and shell")) return "acf.hook.run.args-and-shell";
  if (message.includes("requires command")) return "acf.mcp.transport.missing-command";
  if (message.includes("requires url")) return "acf.mcp.transport.missing-url";
  if (message.includes("unknown source scheme"))
    return "acf.capabilities-yml.source.unknown-scheme";
  if (issue.code === "unrecognized_keys" && unknownKeyCode !== undefined) return unknownKeyCode;
  return baseCode;
}
