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

/**
 * Parses `claude plugin list --json` (an array of `{id, version, scope, enabled, installPath,
 * projectPath?, ...}`, verified with Claude 2.1.97). Throws when the output is not that shape, so a
 * changed CLI is reported as unreadable state instead of being planned against.
 */
export function parsePluginList(stdout: string): ClaudeInstalledPlugin[] {
  return parseArray(stdout, "claude plugin list --json").map((entry, index) => {
    const at = `claude plugin list --json entry ${index}`;
    const id = stringField(entry, "id", at);
    const separator = id.lastIndexOf("@");
    if (separator <= 0 || separator === id.length - 1) {
      throw new Error(`${at}: id ${JSON.stringify(id)} is not <plugin>@<marketplace>`);
    }
    const enabled = entry.enabled;
    if (typeof enabled !== "boolean") throw new Error(`${at}: enabled is not a boolean`);
    const projectPath = entry.projectPath;
    if (projectPath !== undefined && typeof projectPath !== "string") {
      throw new Error(`${at}: projectPath is not a string`);
    }
    return {
      id,
      name: id.slice(0, separator),
      marketplace: id.slice(separator + 1),
      version: stringField(entry, "version", at),
      scope: stringField(entry, "scope", at),
      enabled,
      installPath: stringField(entry, "installPath", at),
      projectPath,
    };
  });
}

/** Parses `claude plugin marketplace list --json` (an array of `{name, source, path?, ...}`). */
export function parseMarketplaceList(stdout: string): ClaudeKnownMarketplace[] {
  return parseArray(stdout, "claude plugin marketplace list --json").map((entry, index) => {
    const at = `claude plugin marketplace list --json entry ${index}`;
    const path = entry.path;
    return {
      name: stringField(entry, "name", at),
      source: stringField(entry, "source", at),
      path: typeof path === "string" ? path : undefined,
    };
  });
}

function parseArray(stdout: string, what: string): Record<string, unknown>[] {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${what} did not print JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(value)) throw new Error(`${what} did not print a JSON array`);
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${what} entry ${index} is not an object`);
    }
    return entry as Record<string, unknown>;
  });
}

function stringField(entry: Record<string, unknown>, key: string, at: string): string {
  const value = entry[key];
  if (typeof value !== "string") throw new Error(`${at}: ${key} is not a string`);
  return value;
}
