import type { Diagnostic } from "@acf/core";
import { colors } from "consola/utils";
import { type ExitCode, readFailOnLossy, readQuiet, readVerbose } from "./args";
import type { PlanView } from "./plan-view";
import { columns } from "./render";

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
  plan(view: PlanView): void;
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
      const color =
        action === "create" ? colors.green : action === "update" ? colors.yellow : colors.red;
      writeStdout(`  ${label(action.toUpperCase(), color)}  ${colors.bold(path)}`);
      writeStdout(`          ${colors.dim(context)}`);
    },
    pending(message) {
      if (!quiet) writeStdout(`\n${label("PENDING", colors.yellow)}  ${message}`);
    },
    group(title, detail) {
      if (!quiet)
        writeStdout(
          `${colors.bold(title)}${detail === undefined ? "" : `  ${colors.dim(detail)}`}`,
        );
    },
    item(primary, secondary) {
      if (!quiet)
        writeStdout(
          `  ${colors.bold(primary)}${secondary === undefined ? "" : `  ${colors.dim(secondary)}`}`,
        );
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
      const color =
        diagnostic.severity === "error"
          ? colors.red
          : diagnostic.severity === "info"
            ? colors.blue
            : colors.yellow;
      const lines = [
        `${label(status, color)}  ${colors.bold(diagnostic.code)}`,
        `      ${sentenceCase(diagnostic.message)}`,
      ];
      if (diagnostic.path !== undefined)
        lines.push(`      ${colors.dim("Path")}    ${diagnostic.path}`);
      if (diagnostic.targetId !== undefined)
        lines.push(`      ${colors.dim("Target")}  ${diagnostic.targetId}`);
      const write = diagnostic.severity === "info" ? writeStdout : writeStderr;
      for (const line of lines) write(line);
    },
    status(status, message) {
      if (quiet) return;
      const color =
        status === "pass" ? colors.green : status === "warn" ? colors.yellow : colors.red;
      writeStdout(`  ${label(status.toUpperCase(), color)}  ${message}`);
    },
    plan(view) {
      for (const line of renderPlan(view, { quiet })) writeStdout(line);
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

export function renderPlan(view: PlanView, options: { quiet: boolean }): string[] {
  if (options.quiet) return [];
  const lines: string[] = [];
  const scopeCount = view.scopes.length;
  lines.push(
    colors.bold(
      `Plan: ${view.fileCount} ${view.fileCount === 1 ? "change" : "changes"}${scopeCount > 1 ? ` across ${scopeCount} scopes` : ""}`,
    ),
  );
  for (const scope of view.scopes) {
    lines.push("");
    lines.push(`${colors.bold(scope.scope)}  ${colors.dim(scope.root)}`);
    for (const destination of scope.destinations) {
      lines.push(`  ${colors.bold(destination.label)}  ${colors.dim(destination.installRoot)}`);
      const rowCells = destination.rows.map((row) => [
        `    ${actionSymbol(row.action)} ${row.notice ? colors.dim(row.path) : row.path}`,
        row.fileCount > 1 ? colors.dim(`${row.fileCount} files`) : "",
        colors.dim(capabilityList(row.capabilities)),
      ]);
      for (const line of columns(rowCells, { align: ["left", "right", "left"] })) lines.push(line);
    }
  }
  const showTable =
    view.totals.length > 1 ||
    view.scopes.some((scope) => scope.destinations.some((d) => d.rows.length > 10));
  lines.push("");
  if (showTable) {
    const head = ["SCOPE", "TARGET", "CREATE", "UPDATE", "DELETE"].map((cell) => colors.dim(cell));
    const body = view.totals.map((totals) => [
      totals.scope,
      totals.target,
      countCell(totals.create),
      countCell(totals.update),
      countCell(totals.delete),
    ]);
    for (const line of columns([head, ...body], {
      align: ["left", "left", "right", "right", "right"],
      indent: "  ",
    }))
      lines.push(line);
    lines.push("");
  }
  const created = view.totals.reduce((sum, t) => sum + t.create, 0);
  const updated = view.totals.reduce((sum, t) => sum + t.update, 0);
  const deleted = view.totals.reduce((sum, t) => sum + t.delete, 0);
  lines.push(
    `${colors.green(`+ ${created} create`)}  ${colors.yellow(`~ ${updated} update`)}  ${colors.red(`- ${deleted} delete`)}`,
  );
  return lines;
}

function actionSymbol(action: "create" | "update" | "delete"): string {
  if (action === "create") return colors.green("+");
  if (action === "update") return colors.yellow("~");
  return colors.red("-");
}

function capabilityList(capabilities: readonly string[]): string {
  if (capabilities.length === 0) return "";
  if (capabilities.length <= 3) return capabilities.join(", ");
  return `${capabilities.slice(0, 3).join(", ")}, +${capabilities.length - 3} more`;
}

function countCell(count: number): string {
  return count === 0 ? colors.dim("-") : String(count);
}
