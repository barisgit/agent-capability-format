import { createConsola } from "consola";
import type { Diagnostic } from "@acf/core";
import { readFailOnLossy, readQuiet, readVerbose, type ExitCode } from "./args";

const logger = createConsola({ level: 5 });

export type Reporter = {
  log(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export function reporter(args: Record<string, unknown>): Reporter {
  const quiet = readQuiet(args);
  return {
    log(message) {
      if (!quiet) logger.log(message);
    },
    info(message) {
      if (!quiet) logger.info(message);
    },
    warn(message) {
      if (!quiet) logger.warn(message);
    },
    error(message) {
      logger.error(message);
    },
  };
}

export function printDiagnostics(
  diagnostics: readonly Diagnostic[],
  args: Record<string, unknown>,
): void {
  const out = reporter(args);
  const verbose = readVerbose(args);
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "info" && !verbose) continue;
    const line = formatDiagnostic(diagnostic);
    if (diagnostic.severity === "error") out.error(line);
    else if (diagnostic.severity === "warn" || diagnostic.severity === "lossy") out.warn(line);
    else out.info(line);
  }
}

export function exitCodeForDiagnostics(
  diagnostics: readonly Diagnostic[],
  args: Record<string, unknown>,
): ExitCode {
  if (readFailOnLossy(args) && diagnostics.some((diagnostic) => diagnostic.severity === "lossy")) {
    return 4;
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return 2;
  return 0;
}

export function finishWithDiagnostics(
  diagnostics: readonly Diagnostic[],
  args: Record<string, unknown>,
): ExitCode {
  printDiagnostics(diagnostics, args);
  const code = exitCodeForDiagnostics(diagnostics, args);
  process.exitCode = code;
  return code;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const parts = [`${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`];
  if (diagnostic.path !== undefined) parts.push(`(${diagnostic.path})`);
  if (diagnostic.targetId !== undefined) parts.push(`[${diagnostic.targetId}]`);
  return parts.join(" ");
}
