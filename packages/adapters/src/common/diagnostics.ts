import type { Diagnostic, FacetFamily, TargetId } from "@caplet/core";

export type AdapterLossyCode =
  | "acf.adapter.facet-unsupported"
  | "acf.adapter.effect-degraded"
  | "acf.adapter.hook-event-unsupported"
  | "acf.adapter.trigger-unsupported"
  | "acf.adapter.scope-unsupported"
  | "acf.assets.unsupported";

type DiagnosticInput = {
  severity: Diagnostic["severity"];
  code: string;
  message: string;
  targetId?: TargetId | undefined;
  family?: FacetFamily | undefined;
  path?: string | undefined;
  data?: Record<string, unknown> | undefined;
};

export function pushDiag(diagnostics: Diagnostic[], input: DiagnosticInput): void {
  diagnostics.push(toDiagnostic(input));
}

export function pushLossy(
  diagnostics: Diagnostic[],
  input: Omit<DiagnosticInput, "severity" | "code"> & { code: AdapterLossyCode },
): void {
  diagnostics.push(toDiagnostic({ ...input, severity: "lossy" }));
}

function toDiagnostic(input: DiagnosticInput): Diagnostic {
  const diagnostic: Diagnostic = {
    severity: input.severity,
    code: input.code,
    message: input.message,
  };
  if (input.targetId !== undefined) diagnostic.targetId = input.targetId;
  if (input.family !== undefined) diagnostic.family = input.family;
  if (input.path !== undefined) diagnostic.path = input.path;
  if (input.data !== undefined) diagnostic.data = input.data;
  return diagnostic;
}
