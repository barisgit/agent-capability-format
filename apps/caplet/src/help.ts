import { colors } from "consola/utils";
import { CAPLET_VERSION } from "./internal/json";

type HelpEntry = readonly [name: string, description: string];

const HELP_GROUPS: ReadonlyArray<readonly [title: string, entries: HelpEntry[]]> = [
  [
    "MANAGE",
    [
      ["init", "create .agents/capabilities.yml for this project"],
      ["add <source>...", "add capabilities from a source and apply them"],
      ["remove <name>...", "remove a capability and its managed output"],
      ["update [name]", "re-resolve sources to their latest refs and apply"],
    ],
  ],
  ["SYNC", [["apply", "reconcile emitted files with your capability manifests"]]],
  [
    "INSPECT",
    [
      ["status", "summarize scopes, capabilities, and pending changes"],
      ["list", "list installed capabilities (alias: ls)"],
      ["show <name>", "show a capability's contents and target support"],
      ["check", "validate manifests and detect stale outputs (CI-friendly)"],
      ["doctor", "check caplet environment and setup"],
    ],
  ],
  ["SETUP", [["completion <shell>", "print shell completions (bash, zsh, fish)"]]],
];

const GLOBAL_FLAGS: HelpEntry[] = [
  ["-s, --scope <project|user>", "limit to one scope (default: both; mutations infer)"],
  ["-t, --target <id>", "limit targets: claude, codex, opencode, pi (repeatable)"],
  ["-C, --cwd <dir>", "run as if caplet were started in <dir>"],
  ["-n, --dry-run", "show the change plan without writing anything"],
  ["-y, --yes", "skip confirmation prompts"],
  ["-q, --quiet", "errors only"],
  ["-v, --verbose", "expand file lists and show info diagnostics"],
  ["    --json", "machine-readable output on stdout"],
  ["-V, --version", "print the caplet version"],
  ["-h, --help", "show this help or a command's help"],
];

export function rootHelp(): string {
  const lines: string[] = [];
  lines.push(
    `${colors.bold("caplet")} ${colors.dim(`v${CAPLET_VERSION}`)} — install agent capabilities and sync them into your AI tools`,
  );
  lines.push("");
  lines.push(`${colors.dim("USAGE")}  caplet [command] [flags]`);
  lines.push(`${colors.dim("       ")}Running caplet with no command prints a status summary.`);
  const width = Math.max(
    ...HELP_GROUPS.flatMap(([, entries]) => entries.map(([name]) => name.length)),
    ...GLOBAL_FLAGS.map(([name]) => name.length),
  );
  for (const [title, entries] of HELP_GROUPS) {
    lines.push("");
    lines.push(colors.bold(title));
    for (const [name, description] of entries) {
      lines.push(`  ${name.padEnd(width)}  ${colors.dim(description)}`);
    }
  }
  lines.push("");
  lines.push(colors.bold("GLOBAL FLAGS"));
  for (const [name, description] of GLOBAL_FLAGS) {
    lines.push(`  ${name.padEnd(width)}  ${colors.dim(description)}`);
  }
  lines.push("");
  lines.push(colors.dim("Learn more: caplet <command> --help"));
  return `${lines.join("\n")}\n`;
}
