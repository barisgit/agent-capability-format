import type { ExecutableChange, ExecutableKind } from "@caplet/core";
import { colors } from "consola/utils";
import { columns } from "./render.js";

const kindNouns: Partial<Record<ExecutableKind, string>> = {
  "mcp-server": "MCP server",
  "lsp-server": "LSP server",
  bin: "bin entry",
  file: "executable file",
};

/**
 * The executable change report (install-integrity, Executable change report): one block per
 * target, one line per component added (`+`), changed (`~`) or removed (`-`) with its command
 * line or paths (and the previous ones when they changed) and its capability. Target headers name the scope when changes span several.
 * The section starts with a blank line to separate it from what precedes it. Returns no lines
 * when nothing changed, so the section appears only when it is non-empty.
 */
export function renderExecutableChanges(changes: readonly ExecutableChange[]): string[] {
  if (changes.length === 0) return [];
  const multiScope = new Set(changes.map((item) => item.scope)).size > 1;
  const groups = new Map<string, ExecutableChange[]>();
  for (const item of changes) {
    const header = multiScope ? `${item.target} (${item.scope})` : item.target;
    groups.set(header, [...(groups.get(header) ?? []), item]);
  }
  const lines = ["", colors.bold("Executable changes")];
  for (const [header, items] of groups) {
    lines.push(`  ${colors.bold(header)}`);
    const rows = items.map((item) => [
      `    ${changeSymbol(item.change)} ${kindNouns[item.kind] ?? item.kind} ${item.name}${detail(item)}`,
      colors.dim(item.capability),
    ]);
    lines.push(...columns(rows));
  }
  return lines;
}

function detail(item: ExecutableChange): string {
  const text = item.detail === item.name ? "" : `: ${item.detail}`;
  return item.previous === undefined ? text : `${text} ${colors.dim(`(was: ${item.previous})`)}`;
}

function changeSymbol(change: ExecutableChange["change"]): string {
  if (change === "added") return colors.green("+");
  if (change === "changed") return colors.yellow("~");
  return colors.red("-");
}
