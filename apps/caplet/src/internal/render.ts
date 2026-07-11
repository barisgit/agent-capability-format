// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences requires the ESC control character
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function width(value: string): number {
  return stripAnsi(value).length;
}

export type Align = "left" | "right";

export type ColumnOptions = {
  align?: readonly Align[];
  gap?: number;
  indent?: string;
};

export function columns(
  rows: readonly (readonly string[])[],
  options: ColumnOptions = {},
): string[] {
  if (rows.length === 0) return [];
  const gap = " ".repeat(options.gap ?? 2);
  const indent = options.indent ?? "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths: number[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    widths.push(Math.max(...rows.map((row) => width(row[index] ?? ""))));
  }
  return rows.map((row) => {
    const cells = row.map((cell, index) => {
      const pad = (widths[index] ?? 0) - width(cell);
      const align = options.align?.[index] ?? "left";
      return align === "right" ? " ".repeat(pad) + cell : cell + " ".repeat(pad);
    });
    return (indent + cells.join(gap)).trimEnd();
  });
}

export function truncateMiddle(value: string, max: number): string {
  if (max <= 1 || width(value) <= max) return value;
  const ellipsis = "\u2026";
  const budget = max - 1;
  const head = Math.ceil(budget / 2);
  const tail = budget - head;
  return `${value.slice(0, head)}${ellipsis}${tail === 0 ? "" : value.slice(-tail)}`;
}

export function terminalWidth(): number {
  return process.stdout.columns ?? 80;
}

export type Glyphs = { ok: string; fail: string; warn: string };

export function glyphs(tty: boolean = process.stdout.isTTY === true): Glyphs {
  return tty
    ? { ok: "\u2713", fail: "\u2717", warn: "!" }
    : { ok: "ok", fail: "fail", warn: "warn" };
}
