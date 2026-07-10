import type { Diagnostic } from "@acf/core";
import { colors } from "consola/utils";
import { readFailOnLossy, readQuiet, readVerbose, type ExitCode } from "./args";

export type Reporter = {
  log(message: string): void;
  error(message: string): void;
  heading(command: string): void;
  done(message: string): void;
  details(entries: ReadonlyArray<readonly [label: string, value: string | number]>): void;
  section(title: string): void;
  change(action: "create" | "update" | "delete", path: string, context: string): void;
  pending(message: string): void;
  group(title: string, detail?: string): void;
  item(primary: string, secondary?: string): void;
  empty(message: string, hint?: string): void;
  diagnostic(diagnostic: Diagnostic): void;
  status(status: "pass" | "warn" | "fail", message: string): void;
};

export type ChangePresentation = {
  action: "create" | "update" | "delete";
  path: string;
  context: string;
};

export function printChanges(out: Reporter, changes: readonly ChangePresentation[]): void {
  if (changes.length === 0) {
    out.section("No changes");
    out.empty("Managed output already matches the resolved capabilities.");
    return;
  }
  out.section("Changes");
  for (const change of changes) out.change(change.action, change.path, change.context);
}

export function reporter(args: Record<string, unknown>): Reporter {
  const quiet = readQuiet(args);
  return {
    log(message) {
      if (!quiet) writeStdout(message);
    },
    error(message) {
      writeStderr(`${label("FAIL", colors.red)}  ${sentenceCase(message)}`);
    },
    heading(command) {
      if (!quiet) writeStdout(`${colors.bold(colors.cyan("Caplet"))} ${colors.dim(command)}\n`);
    },
    done(message) {
      if (!quiet) writeStdout(`${label("DONE", colors.green)}  ${message}`);
    },
    details(entries) {
      if (quiet || entries.length === 0) return;
      const width = Math.max(...entries.map(([entryLabel]) => entryLabel.length));
      for (const [entryLabel, value] of entries) {
        writeStdout(`      ${colors.dim(entryLabel.padEnd(width))}  ${String(value)}`);
      }
    },
    section(title) {
      if (!quiet) writeStdout(colors.bold(title));
    },
    change(action, path, context) {
      if (quiet) return;
      const color = action === "create" ? colors.green : action === "update" ? colors.yellow : colors.red;
      writeStdout(`  ${label(action.toUpperCase(), color)}  ${colors.bold(path)}`);
      writeStdout(`          ${colors.dim(context)}`);
    },
    pending(message) {
      if (!quiet) writeStdout(`\n${label("PENDING", colors.yellow)}  ${message}`);
    },
    group(title, detail) {
      if (!quiet) writeStdout(`${colors.bold(title)}${detail === undefined ? "" : `  ${colors.dim(detail)}`}`);
    },
    item(primary, secondary) {
      if (!quiet) writeStdout(`  ${colors.bold(primary)}${secondary === undefined ? "" : `  ${colors.dim(secondary)}`}`);
    },
    empty(message, hint) {
      if (quiet) return;
      writeStdout(`  ${message}`);
      if (hint !== undefined) writeStdout(`  ${colors.dim(hint)}`);
    },
    diagnostic(diagnostic) {
      if (quiet && diagnostic.severity !== "error") return;
      const status =
        diagnostic.severity === "error" ? "FAIL" : diagnostic.severity === "info" ? "INFO" : "WARN";
      const color = diagnostic.severity === "error" ? colors.red : diagnostic.severity === "info" ? colors.blue : colors.yellow;
      const lines = [
        `${label(status, color)}  ${colors.bold(diagnostic.code)}`,
        `      ${sentenceCase(diagnostic.message)}`,
      ];
      if (diagnostic.path !== undefined) lines.push(`      ${colors.dim("Path")}    ${diagnostic.path}`);
      if (diagnostic.targetId !== undefined) lines.push(`      ${colors.dim("Target")}  ${diagnostic.targetId}`);
      const write = diagnostic.severity === "info" ? writeStdout : writeStderr;
      for (const line of lines) write(line);
    },
    status(status, message) {
      if (quiet) return;
      const color = status === "pass" ? colors.green : status === "warn" ? colors.yellow : colors.red;
      writeStdout(`  ${label(status.toUpperCase(), color)}  ${message}`);
    },
  };
}

function label(text: string, color: (value: string | number) => string): string {
  return colors.bold(color(text));
}

function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function printDiagnostics(
  diagnostics: readonly Diagnostic[],
  args: Record<string, unknown>,
): void {
  const out = reporter(args);
  const verbose = readVerbose(args);
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "info" && !verbose) continue;
    out.diagnostic(diagnostic);
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


function sentenceCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}
