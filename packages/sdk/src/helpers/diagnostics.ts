import type { Diagnostic } from "@caplet/core";

export type DiagnosticHandler = (d: Diagnostic) => void;
export type Unsubscribe = () => void;

const handlers = new Set<DiagnosticHandler>();

export class AcfError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(messageFor(diagnostics));
    this.name = "AcfError";
    this.diagnostics = diagnostics;
  }
}

export function onDiagnostic(handler: DiagnosticHandler): Unsubscribe {
  handlers.add(handler);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    handlers.delete(handler);
  };
}

export function emitDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    for (const handler of handlers) handler(diagnostic);
  }
}

export function throwOnErrorDiagnostics(diagnostics: Diagnostic[]): void {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new AcfError(diagnostics);
  }
}

function messageFor(diagnostics: readonly Diagnostic[]): string {
  const firstError = diagnostics.find((diagnostic) => diagnostic.severity === "error");
  return firstError?.message ?? "ACF diagnostics contain errors";
}
