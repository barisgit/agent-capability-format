/**
 * Paths a plugin-carrier writer generates inside a package (claude-plugin-output, Claude plugin
 * writer). Validation uses them to reject `native/<target>/` files that would overwrite
 * generated output (capability-model-layers, File-level native extras); the writer uses the same
 * list so both agree on what is generated.
 */
import path from "node:path";
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
