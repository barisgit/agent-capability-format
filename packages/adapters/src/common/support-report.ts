/**
 * Shared support bookkeeping for native writers: one component (a skill or an MCP server)
 * rendered for one target collects the support diagnostics of the fields it carries, the
 * translated outcomes the writer knows positively, and whether anything refuses it.
 */
import {
  type ComponentOutcome,
  type Diagnostic,
  extraDropped,
  extrasDialects,
  nativeExtras,
  type SupportCell,
  type SupportSubject,
  supportCell,
  supportDiagnostic,
  type TargetExtensions,
  translatedOutcome,
} from "@caplet/core";

/** Support decisions for one component on one target and carrier. */
export type ComponentReport = {
  diagnostics: Diagnostic[];
  /** Outcomes the writer knows positively (translated cells); others derive from diagnostics. */
  outcomes: ComponentOutcome[];
  /** True when a support cell or a restricting foreign extra refuses the component. */
  refused: boolean;
};

/** Diagnostics and outcomes a writer accumulates across the components of one capability. */
export type EmitReport = Pick<ComponentReport, "diagnostics" | "outcomes">;

/** An empty report to fill with `considerField` and `reportForeignExtras`. */
export function emptyReport(): ComponentReport {
  return { diagnostics: [], outcomes: [], refused: false };
}

/**
 * Records the support decision for a present `field` of `subject`: pushes its support
 * diagnostic and translated outcome, marks the report refused on a refusal, and returns the
 * cell so the caller can write native and translated values and skip degraded ones.
 */
export function considerField(
  report: ComponentReport,
  subject: SupportSubject,
  field: string,
): SupportCell | undefined {
  const diagnostic = supportDiagnostic(subject, field);
  if (diagnostic !== undefined) {
    report.diagnostics.push(diagnostic);
    if (diagnostic.code === "acf.support.refused") report.refused = true;
  }
  const translated = translatedOutcome(subject, field);
  if (translated !== undefined) report.outcomes.push(translated);
  return supportCell(field, subject.target, subject.carrier ?? "loose");
}

/**
 * Reports every native extra declared for a dialect other than `subject.target` as dropped,
 * or as a refusal of the component when the key restricts and has no core equivalent.
 */
export function reportForeignExtras(
  report: ComponentReport,
  subject: SupportSubject & { family: "skill" | "mcp" },
  targets: TargetExtensions | undefined,
): void {
  for (const dialect of extrasDialects(targets)) {
    if (dialect === subject.target) continue;
    for (const [key, value] of Object.entries(nativeExtras(targets, dialect))) {
      const diagnostic = extraDropped(subject, { owner: dialect, key, value });
      report.diagnostics.push(diagnostic);
      if (diagnostic.code === "acf.support.refused") report.refused = true;
    }
  }
}
