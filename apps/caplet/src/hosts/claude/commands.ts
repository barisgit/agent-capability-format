/**
 * The `claude plugin` commands caplet runs, as data. One place builds their argument vectors
 * (for the CLI runner and the fake transcripts) and their display form (for recovery hints).
 * Flags are pinned by the Claude 2.1.97 transcripts in `tests/fixtures/claude-cli/`.
 */

/** A Claude settings scope as `--scope` spells it. Caplet itself only registers at `user` and `local` (D25). */
export type ClaudeScope = "user" | "project" | "local";

/**
 * A state-changing `claude plugin` command. `plugin` is a plugin id, `<name>@<marketplace>`.
 * Marketplace update and remove take no scope: Claude keeps one marketplace record per name for
 * the whole user, and remove uninstalls that marketplace's plugins in every scope.
 */
export type ClaudeCommand =
  | { op: "marketplace add"; dir: string; scope: ClaudeScope }
  | { op: "marketplace update"; marketplace: string }
  | { op: "marketplace remove"; marketplace: string }
  | { op: "install" | "update"; plugin: string; scope: ClaudeScope }
  /**
   * `keepData` passes `--keep-data`, which keeps the plugin's data directory. Claude still deletes
   * the options and secrets it saved for the plugin when this is the id's last install.
   */
  | { op: "uninstall"; plugin: string; scope: ClaudeScope; keepData: boolean };

/** Arguments after the program name for `command`; scoped commands always pass `--scope`. */
export function claudeArgs(command: ClaudeCommand): string[] {
  switch (command.op) {
    case "marketplace add":
      return ["plugin", "marketplace", "add", command.dir, "--scope", command.scope];
    case "marketplace update":
      return ["plugin", "marketplace", "update", command.marketplace];
    case "marketplace remove":
      return ["plugin", "marketplace", "remove", command.marketplace];
    case "install":
    case "update":
      return ["plugin", command.op, command.plugin, "--scope", command.scope];
    case "uninstall": {
      const args = ["plugin", "uninstall", command.plugin, "--scope", command.scope];
      return command.keepData ? [...args, "--keep-data"] : args;
    }
  }
}

/** Arguments of `claude plugin list --json`. */
export const LIST_PLUGINS_ARGS: readonly string[] = ["plugin", "list", "--json"];

/** Arguments of `claude plugin marketplace list --json`. */
export const LIST_MARKETPLACES_ARGS: readonly string[] = [
  "plugin",
  "marketplace",
  "list",
  "--json",
];

/** The command as a POSIX shell line a user can paste, for recovery hints. */
export function formatClaudeCommand(command: ClaudeCommand): string {
  return formatClaudeArgs(claudeArgs(command));
}

/** `claude` with `args` (the arguments after the program name) as a POSIX shell line. */
export function formatClaudeArgs(args: readonly string[]): string {
  return ["claude", ...args].map(shellQuote).join(" ");
}

function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
