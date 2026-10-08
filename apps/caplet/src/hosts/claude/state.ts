/** Host state as `claude plugin list --json` and `claude plugin marketplace list --json` report it. */

/** One entry of `claude plugin list --json`. */
export type ClaudeInstalledPlugin = {
  /** `<name>@<marketplace>`. */
  id: string;
  name: string;
  marketplace: string;
  version: string;
  scope: string;
  /** False when the user disabled the plugin; caplet never re-enables it (D15). */
  enabled: boolean;
  installPath: string;
  /** Absolute project path, present for project and local installs. */
  projectPath?: string | undefined;
};

/** One entry of `claude plugin marketplace list --json`; Claude records no scope here. */
export type ClaudeKnownMarketplace = {
  name: string;
  source: string;
  path?: string | undefined;
};

/** What the host reported before planning. */
export type ObservedClaudeState = {
  plugins: ClaudeInstalledPlugin[];
  marketplaces: ClaudeKnownMarketplace[];
};
