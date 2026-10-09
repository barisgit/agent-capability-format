/**
 * Host state as `claude plugin list --json`, `claude plugin marketplace list --json` and the
 * Claude settings files report it, and the parsers that read it.
 */
import { isRecord } from "@caplet/core";
import type { ClaudeScope } from "./commands.js";

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

/** What caplet reads from one Claude settings file. */
export type ClaudeSettings = {
  /** Marketplaces declared in `extraKnownMarketplaces` or named in an `enabledPlugins` key. */
  marketplaces: string[];
  /**
   * Plugin ids with options saved in `pluginConfigs`. Claude deletes them, with the plugin's
   * secrets, when the id's last install is uninstalled (Claude 2.1.97).
   */
  configuredPlugins: string[];
};

/**
 * A Claude settings file that `claude plugin marketplace remove` edits when run from
 * `projectDir`: the user file and that directory's project and local files (verified with
 * Claude 2.1.97). The command drops every declaration of the marketplace in them.
 */
export type ClaudeSettingsFile = {
  scope: ClaudeScope;
  path: string;
  /** `undefined` when the file exists but cannot be read as settings. */
  settings: ClaudeSettings | undefined;
};

/** What the host reported before planning. */
export type ObservedClaudeState = {
  plugins: ClaudeInstalledPlugin[];
  marketplaces: ClaudeKnownMarketplace[];
  /**
   * Directory Claude resolves `project` and `local` scope from (the working directory of every
   * command). `plugin list` also lists other directories' project and local installs, each with
   * its `projectPath`.
   */
  projectDir: string;
  settings: ClaudeSettingsFile[];
};

/** Parses the text of a Claude settings file. Throws when it is not a JSON object. */
export function parseClaudeSettings(text: string): ClaudeSettings {
  const settings: unknown = JSON.parse(text);
  if (!isRecord(settings)) throw new Error("settings are not a JSON object");
  const declared = isRecord(settings.extraKnownMarketplaces)
    ? Object.keys(settings.extraKnownMarketplaces)
    : [];
  const enabled = isRecord(settings.enabledPlugins)
    ? Object.keys(settings.enabledPlugins).flatMap((id) => {
        const separator = id.lastIndexOf("@");
        return separator > 0 ? [id.slice(separator + 1)] : [];
      })
    : [];
  return {
    marketplaces: [...new Set([...declared, ...enabled])],
    configuredPlugins: isRecord(settings.pluginConfigs) ? Object.keys(settings.pluginConfigs) : [],
  };
}

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
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${what} did not print JSON: ${reason}`);
  }
  if (!Array.isArray(value)) throw new Error(`${what} did not print a JSON array`);
  return value.map((entry: unknown, index) => {
    if (!isRecord(entry)) throw new Error(`${what} entry ${index} is not an object`);
    return entry;
  });
}

function stringField(entry: Record<string, unknown>, key: string, at: string): string {
  const value = entry[key];
  if (typeof value !== "string") throw new Error(`${at}: ${key} is not a string`);
  return value;
}
