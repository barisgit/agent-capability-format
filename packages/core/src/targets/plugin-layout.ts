/**
 * Plugin package layout. Paths a plugin-carrier writer generates inside a package
 * (claude-plugin-output, Claude plugin writer): validation uses them to reject
 * `native/<target>/` files that would overwrite generated output (capability-model-layers,
 * File-level native extras). The Claude writer builds its paths separately, so a layout change
 * must update both. Also the Claude plugin components that live beside the projected ones: how
 * Claude discovers each and whether it runs code, so the Claude plugin reader, the executable-change
 * report and the Claude writer record and recognize them alike.
 */
import path from "node:path";
import type { NativeRemainderKind } from "../types/interop.js";
import type { TargetId } from "../types/model.js";

/**
 * The caplet-owned local marketplace of one install scope: `<install-root>/.acf/marketplace/`,
 * listing each generated plugin by the relative source `./plugins/<name>`.
 */
export function pluginMarketplaceDir(installRoot: string): string {
  return path.join(installRoot, ".acf", "marketplace");
}

/** The directory of generated plugin `name` inside the scope's marketplace. */
export function pluginPackageDir(installRoot: string, name: string): string {
  return path.join(pluginMarketplaceDir(installRoot), "plugins", name);
}

/** Manifest of a Claude plugin, relative to the plugin root. */
export const CLAUDE_PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

/** What a capability contributes to one target's plugin: emitted skill names and any server. */
export type PluginContents = { skills: readonly string[]; mcp: boolean };

/**
 * Package-relative paths the plugin writer of `target` generates for `contents`; a path ending
 * in `/` stands for a whole directory. Empty for targets without a plugin carrier.
 */
export function generatedPluginPaths(target: TargetId, contents: PluginContents): string[] {
  if (target !== "claude") return [];
  return [
    CLAUDE_PLUGIN_MANIFEST,
    ...contents.skills.map((skill) => `skills/${skill}/`),
    ...(contents.mcp ? [".mcp.json"] : []),
  ];
}

/**
 * The generated path that package-relative `file` collides with, or undefined: `file` equals a
 * generated path, lies under it, or sits where a directory on the way to it must be. Paths are
 * compared after NFC normalization and case folding, so a file that would overwrite generated
 * output on a case-insensitive file system collides too.
 */
export function generatedPathCollision(
  generated: readonly string[],
  file: string,
): string | undefined {
  const target = fold(file);
  return generated.find((entry) => {
    const folded = fold(entry).replace(/\/$/, "");
    return target === folded || target.startsWith(`${folded}/`) || folded.startsWith(`${target}/`);
  });
}

function fold(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

type PluginComponentBase = {
  kind: NativeRemainderKind;
  /** The manifest key that declares the component. */
  key: string;
  /** Whether the component starts code on the host, whatever its files' modes. */
  executes: boolean;
};

/**
 * A Claude plugin component that ACF does not project and that is one component per package: the
 * default `file`, when there is one, merges with the paths and value of manifest key `key`.
 */
export type MergedComponentSpec = PluginComponentBase & {
  name: string;
  file?: string;
  /** Limits the key to values that hold this component; without it every value does. */
  holds?: (value: unknown) => boolean;
};

/**
 * A Claude plugin component kind of which every file is one component, named by
 * {@link perFileComponentName}: the files under the default directory `dir`, or, when the manifest
 * sets `key`, the files at or under the paths it names instead, since such a key replaces default
 * discovery.
 */
export type PerFileComponentSpec = PluginComponentBase & { dir: string };

export type PluginComponentSpec = MergedComponentSpec | PerFileComponentSpec;

/**
 * Claude plugin components outside the projected skills and MCP servers, in record order: the
 * per-file kinds first, then the merged ones.
 */
export const claudePluginComponents: readonly PluginComponentSpec[] = [
  { kind: "agent", key: "agents", dir: "agents", executes: false },
  { kind: "command", key: "commands", dir: "commands", executes: false },
  { kind: "output-style", key: "outputStyles", dir: "output-styles", executes: false },
  // JavaScript modules Claude's workflow runtime runs (research/plugin-interop/tools/claude-code.md).
  { kind: "workflow", key: "workflows", dir: "workflows", executes: true },
  { kind: "hook", name: "hooks", key: "hooks", file: "hooks/hooks.json", executes: true },
  { kind: "lsp-server", name: "lsp-servers", key: "lspServers", file: ".lsp.json", executes: true },
  { kind: "settings", name: "settings", key: "settings", file: "settings.json", executes: false },
  { kind: "monitor", name: "monitors", key: "monitors", executes: true },
  {
    kind: "monitor",
    name: "experimental",
    key: "experimental",
    executes: true,
    holds: (value) =>
      typeof value === "object" &&
      value !== null &&
      "monitors" in value &&
      value.monitors !== undefined,
  },
];

/** Whether `spec` makes one component of every file it discovers. */
export function isPerFileComponent(spec: PluginComponentSpec): spec is PerFileComponentSpec {
  return "dir" in spec;
}

/**
 * The name of the component `spec` makes of package-relative `file`. An executing component is
 * named by `file` itself, so the executable change report (install-integrity) tells modules with
 * one file name in different directories apart; any other by its file name without extension,
 * the name Claude gives it.
 */
export function perFileComponentName(spec: PerFileComponentSpec, file: string): string {
  return spec.executes ? file : path.posix.basename(file).replace(/\.[^.]*$/, "");
}

/** The Claude plugin directory whose every file is one executable `bin` component. */
export const CLAUDE_PLUGIN_BIN_DIR = "bin";
