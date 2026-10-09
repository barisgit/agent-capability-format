/**
 * Plugin package layout. Paths a plugin-carrier writer generates inside a package
 * (claude-plugin-output, Claude plugin writer): validation uses them to reject
 * `native/<target>/` files that would overwrite generated output (capability-model-layers,
 * File-level native extras). The Claude writer builds its paths separately, so a layout change
 * must update both. Also the Claude plugin components that live beside the projected ones, so the
 * Claude plugin reader and the executable-change report record them alike.
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

/** What a capability contributes to one target's plugin: emitted skill names and any server. */
export type PluginContents = { skills: readonly string[]; mcp: boolean };

/**
 * Package-relative paths the plugin writer of `target` generates for `contents`; a path ending
 * in `/` stands for a whole directory. Empty for targets without a plugin carrier.
 */
export function generatedPluginPaths(target: TargetId, contents: PluginContents): string[] {
  if (target !== "claude") return [];
  return [
    ".claude-plugin/plugin.json",
    ...contents.skills.map((skill) => `skills/${skill}/`),
    ...(contents.mcp ? [".mcp.json"] : []),
  ];
}

/**
 * The generated path that package-relative `file` collides with, or undefined. Paths are
 * compared after NFC normalization and case folding, so a file that would overwrite generated
 * output on a case-insensitive file system collides too.
 */
export function generatedPathCollision(
  generated: readonly string[],
  file: string,
): string | undefined {
  const target = fold(file);
  return generated.find((entry) => {
    const folded = fold(entry);
    return folded.endsWith("/")
      ? target.startsWith(folded)
      : target === folded || target.startsWith(`${folded}/`);
  });
}

function fold(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

/**
 * A Claude plugin component that ACF does not project: the default `file`, when there is one,
 * merges with the paths and value of manifest key `key` into one component.
 */
export type PluginComponentSpec = {
  kind: NativeRemainderKind;
  name: string;
  key: string;
  file?: string;
  /** Whether the component starts code on the host. */
  executes: boolean;
  /** Limits the key to values that hold this component; without it every value does. */
  holds?: (value: unknown) => boolean;
};

/** Claude plugin components outside the projected skills and MCP servers, in record order. */
export const claudePluginComponents: readonly PluginComponentSpec[] = [
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

/** The Claude plugin directory whose every file is one executable `bin` component. */
export const CLAUDE_PLUGIN_BIN_DIR = "bin";
