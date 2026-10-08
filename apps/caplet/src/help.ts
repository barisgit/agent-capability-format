import { colors } from "consola/utils";
import { CAPLET_VERSION } from "./internal/json.js";
import { columns } from "./internal/render.js";
import {
  COMMAND_SPECS,
  type CommandGroup,
  type CommandSpec,
  commandSpec,
  type FlagSpec,
  GLOBAL_FLAGS,
  TARGET_FLAG,
} from "./internal/spec.js";

const GROUP_ORDER: CommandGroup[] = ["MANAGE", "SYNC", "INSPECT", "SETUP"];

function flagLabel(flag: FlagSpec): string {
  const short = flag.short === undefined ? "    " : `-${flag.short}, `;
  const arg = flag.arg === undefined ? "" : ` ${flag.arg}`;
  return `${short}--${flag.name}${arg}`;
}

function usageToken(spec: CommandSpec): string {
  const positional = (spec.positionals ?? [])
    .map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`))
    .join(" ");
  return positional.length === 0 ? spec.name : `${spec.name} ${positional}`;
}

function visibleFlags(spec: CommandSpec): FlagSpec[] {
  const own = (spec.flags ?? []).filter((flag) => flag.hidden !== true);
  return spec.target ? [TARGET_FLAG, ...own] : own;
}

export function renderRootHelp(): string {
  const lines: string[] = [];
  lines.push(
    `${colors.bold(colors.cyan("caplet"))} ${colors.dim(`v${CAPLET_VERSION}`)} — install agent capabilities and sync them into your AI tools`,
  );
  lines.push("");
  lines.push(`${colors.bold("USAGE")}  caplet [command] [flags]`);
  lines.push(`       ${colors.dim("Running caplet with no command prints a status summary.")}`);
  const rows: string[][] = [];
  for (const group of GROUP_ORDER) {
    const specs = COMMAND_SPECS.filter((spec) => spec.group === group);
    if (specs.length === 0) continue;
    rows.push([`__HEADER__${group}`]);
    for (const spec of specs) {
      rows.push([colors.bold(colors.cyan(usageToken(spec))), colors.dim(spec.summary)]);
    }
  }
  const globalRows = GLOBAL_FLAGS.filter((flag) => flag.hidden !== true).map((flag) => [
    colors.bold(colors.cyan(flagLabel(flag))),
    colors.dim(flag.description),
  ]);
  globalRows.push(
    [colors.bold(colors.cyan("-V, --version")), colors.dim("print the caplet version")],
    [colors.bold(colors.cyan("-h, --help")), colors.dim("show this help or a command's help")],
  );
  const bodyRows = rows.filter((row) => row.length > 1);
  const aligned = columns([...bodyRows, ...globalRows], { indent: "  " });
  let cursor = 0;
  for (const row of rows) {
    if (row.length === 1 && row[0]?.startsWith("__HEADER__")) {
      lines.push("");
      lines.push(colors.bold(row[0].slice("__HEADER__".length)));
      continue;
    }
    lines.push(aligned[cursor] ?? "");
    cursor += 1;
  }
  lines.push("");
  lines.push(colors.bold("GLOBAL FLAGS"));
  for (const line of aligned.slice(cursor)) lines.push(line);
  lines.push("");
  lines.push(colors.dim("Learn more: caplet <command> --help"));
  return `${lines.join("\n")}\n`;
}

export function renderCommandHelp(name: string): string | undefined {
  const spec = commandSpec(name);
  if (spec === undefined) return undefined;
  const lines: string[] = [];
  lines.push(`${colors.bold(colors.cyan(`caplet ${spec.name}`))} — ${colors.dim(spec.summary)}`);
  lines.push("");
  lines.push(`${colors.bold("USAGE")}  ${spec.usage}`);
  const positionals = spec.positionals ?? [];
  if (positionals.length > 0) {
    lines.push("");
    lines.push(colors.bold("ARGUMENTS"));
    for (const line of columns(
      positionals.map((p) => [
        colors.bold(colors.cyan(p.required ? `<${p.name}>` : `[${p.name}]`)),
        colors.dim(p.description),
      ]),
      { indent: "  " },
    )) {
      lines.push(line);
    }
  }
  const flags = visibleFlags(spec);
  if (flags.length > 0) {
    lines.push("");
    lines.push(colors.bold("FLAGS"));
    const rows = flags.map((flag) => {
      const label = flagLabel(flag);
      const suffix =
        flag.negativeDescription === undefined
          ? flag.description
          : `${flag.description} (--no-${flag.name}: ${flag.negativeDescription})`;
      return [colors.bold(colors.cyan(label)), colors.dim(suffix)];
    });
    for (const line of columns(rows, { indent: "  " })) lines.push(line);
  }
  if (spec.globals) {
    lines.push("");
    lines.push(
      `${colors.bold("GLOBAL FLAGS")}  ${colors.dim("-s --scope · -C --cwd · -q --quiet · -v --verbose · -y --yes · --json · --strict (caplet --help for details)")}`,
    );
  }
  const examples = spec.examples ?? [];
  if (examples.length > 0) {
    lines.push("");
    lines.push(colors.bold("EXAMPLES"));
    for (const example of examples) lines.push(`  ${colors.dim("$")} ${example}`);
  }
  return `${lines.join("\n")}\n`;
}
