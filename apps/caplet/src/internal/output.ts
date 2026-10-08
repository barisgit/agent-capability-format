import type { ComponentOutcome, Diagnostic, TargetId } from "@caplet/core";
import { colors } from "consola/utils";
import { type ExitCode, readQuiet, readStrict, readVerbose } from "./args.js";
import { renderCompatibility } from "./compatibility.js";
import type { PlanView } from "./plan-view.js";
import { columns, glyphs } from "./render.js";

export type Reporter = {
  log(message: string): void;
  error(message: string): void;
  done(message: string): void;
  details(entries: ReadonlyArray<readonly [label: string, value: string | number]>): void;
  section(title: string): void;
  pending(message: string): void;
  diagnostic(diagnostic: Diagnostic): void;
  diagnosticSummary(counts: { errors: number; warnings: number; lossy: number }): void;
  status(status: "pass" | "warn" | "fail", message: string): void;
  plan(view: PlanView): void;
  /** Behavior-first compatibility report; precedes the plan's file list. */
  compatibility(outcomes: readonly ComponentOutcome[], targets: readonly TargetId[]): void;
  failure(message: string): void;
  hint(message: string): void;
};

export function reporter(args: Record<string, unknown>): Reporter {
  const quiet = readQuiet(args);
  return {
    log(message) {
      if (!quiet) writeStdout(message);
    },
    error(message) {
      writeStderr(`${label(glyphs().fail, colors.red)} ${sentenceCase(message)}`);
    },
    done(message) {
      if (!quiet) writeStdout(`${label(glyphs().ok, colors.green)} ${message}`);
    },
    details(entries) {
      if (quiet || entries.length === 0) return;
      const width = Math.max(...entries.map(([entryLabel]) => entryLabel.length));
      for (const [entryLabel, value] of entries) {
        writeStdout(`    ${colors.dim(entryLabel.padEnd(width))}  ${String(value)}`);
      }
    },
    section(title) {
      if (!quiet) writeStdout(colors.bold(title));
    },
    pending(message) {
      if (!quiet) writeStdout(`\n${label(glyphs().warn, colors.yellow)} ${message}`);
    },
    diagnostic(diagnostic) {
      if (quiet && diagnostic.severity !== "error") return;
      const glyphSet = glyphs();
      const [glyph, color] =
        diagnostic.severity === "error"
          ? [glyphSet.fail, colors.red]
          : diagnostic.severity === "info"
            ? ["i", colors.blue]
            : [glyphSet.warn, colors.yellow];
      const lines = [
        `${colors.bold(color(glyph))} ${colors.bold(sentenceCase(diagnostic.message))}`,
        `    ${colors.dim("code")}  ${diagnostic.code}`,
      ];
      if (diagnostic.path !== undefined)
        lines.push(`    ${colors.dim("path")}  ${diagnostic.path}`);
      if (diagnostic.targetId !== undefined)
        lines.push(`    ${colors.dim("target")}  ${diagnostic.targetId}`);
      const write = diagnostic.severity === "info" ? writeStdout : writeStderr;
      for (const line of lines) write(line);
    },
    diagnosticSummary(counts) {
      const problems = counts.errors + counts.warnings + counts.lossy;
      if (problems === 0) return;
      const parts = [
        ...(counts.errors === 0
          ? []
          : [`${counts.errors} ${counts.errors === 1 ? "error" : "errors"}`]),
        ...(counts.warnings === 0
          ? []
          : [`${counts.warnings} ${counts.warnings === 1 ? "warning" : "warnings"}`]),
        ...(counts.lossy === 0 ? [] : [`${counts.lossy} lossy`]),
      ];
      writeStderr(
        colors.bold(`${problems} ${problems === 1 ? "problem" : "problems"} (${parts.join(", ")})`),
      );
    },
    status(status, message) {
      if (quiet) return;
      const glyphSet = glyphs();
      const [glyph, color] =
        status === "pass"
          ? [glyphSet.ok, colors.green]
          : status === "warn"
            ? [glyphSet.warn, colors.yellow]
            : [glyphSet.fail, colors.red];
      writeStdout(`  ${label(glyph, color)} ${message}`);
    },
    plan(view) {
      for (const line of renderPlan(view, { quiet })) writeStdout(line);
    },
    compatibility(outcomes, targets) {
      if (quiet) return;
      for (const line of renderCompatibility(outcomes, targets)) writeStdout(line);
    },
    failure(message) {
      writeStderr(`${colors.bold(colors.red(glyphs().fail))} ${sentenceCase(message)}`);
    },
    hint(message) {
      if (!quiet) writeStdout(colors.dim(`  ${message}`));
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
  const seen = new Map<string, number>();
  const unique: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "info" && !verbose) continue;
    const key = `${diagnostic.severity}\u0000${diagnostic.code}\u0000${diagnostic.message}\u0000${diagnostic.path ?? ""}\u0000${diagnostic.targetId ?? ""}`;
    const count = seen.get(key) ?? 0;
    if (count === 0) unique.push(diagnostic);
    seen.set(key, count + 1);
  }
  for (const diagnostic of unique) {
    const key = `${diagnostic.severity}\u0000${diagnostic.code}\u0000${diagnostic.message}\u0000${diagnostic.path ?? ""}\u0000${diagnostic.targetId ?? ""}`;
    const repeats = seen.get(key) ?? 1;
    const message = repeats > 1 ? `${diagnostic.message} (x${repeats})` : diagnostic.message;
    out.diagnostic({ ...diagnostic, message });
  }
  const counted = diagnostics.filter((d) => d.severity !== "info");
  if (counted.length > 0) {
    out.diagnosticSummary({
      errors: counted.filter((d) => d.severity === "error").length,
      warnings: counted.filter((d) => d.severity === "warn").length,
      lossy: counted.filter((d) => d.severity === "lossy").length,
    });
  }
}

export function exitCodeForDiagnostics(
  diagnostics: readonly Diagnostic[],
  args: Record<string, unknown>,
): ExitCode {
  if (readStrict(args) && diagnostics.some((diagnostic) => diagnostic.severity === "lossy")) {
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
