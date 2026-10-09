/**
 * Source format detection and dispatch to the foreign format readers
 * (source-format-readers). Native ACF and bare skills are read by the reader and installer;
 * this module decides which format a package is and reads Agent Plugins and Claude
 * plugin packages as one canonical capability each.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, SourceFormat } from "../types/index.js";
import { isRecord } from "../utils/guards.js";
import { leavesBase } from "../utils/paths.js";
import { agentPluginsSchemaVersion, readAgentPluginsPackage } from "./agent-plugins.js";
import { readClaudePluginPackage } from "./claude-plugin.js";
import type { ForeignReadOptions, ForeignReadResult } from "./package.js";
import { CLAUDE_MANIFEST, isDirectory, isFile } from "./shared.js";

export {
  AGENT_PLUGINS_MCP_SCHEMA,
  agentPluginsSchemaVersion,
  readAgentPluginsPackage,
} from "./agent-plugins.js";
export { claudePluginPreserved, readClaudePluginPackage } from "./claude-plugin.js";
export type { ForeignReadOptions, ForeignReadResult } from "./package.js";

/** Formats read by a foreign format reader in this module. */
export type ForeignFormat = Extract<SourceFormat, "agent-plugins" | "claude-plugin">;

/** A manifest format found at a package root, with its manifest relative to the root. */
export type RecognizedFormat = { format: Exclude<SourceFormat, "skills">; manifest: string };

/** Detection outcome: the selected format, or undefined with an error explaining why. */
export type FormatSelection = {
  format: SourceFormat | undefined;
  diagnostics: Diagnostic[];
};

const MARKETPLACES = [".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"];

/** True when `format` is read by {@link readForeignPackage}. */
export function isForeignFormat(format: SourceFormat): format is ForeignFormat {
  return format === "agent-plugins" || format === "claude-plugin";
}

/**
 * Manifest formats present at `root`, in detection precedence: ACF (`acf.yml`, `acf.yaml`
 * or an `acf/` collection), Agent Plugins (a root `plugin.json` whose `$schema` is an Agent
 * Plugins plugin schema of any version), then Claude plugin (`.claude-plugin/plugin.json`).
 * A root `plugin.json` without that `$schema` belongs to another tool and is not counted.
 */
export async function recognizedFormats(root: string): Promise<RecognizedFormat[]> {
  const found: RecognizedFormat[] = [];
  for (const manifest of ["acf.yml", "acf.yaml"]) {
    if (await isFile(path.join(root, manifest))) {
      found.push({ format: "acf", manifest });
      break;
    }
  }
  if (found.length === 0 && (await isDirectory(path.join(root, "acf"))))
    found.push({ format: "acf", manifest: "acf/" });
  if (agentPluginsSchemaVersion(await parsedJson(path.join(root, "plugin.json"))) !== undefined)
    found.push({ format: "agent-plugins", manifest: "plugin.json" });
  if (await isFile(path.join(root, CLAUDE_MANIFEST)))
    found.push({ format: "claude-plugin", manifest: CLAUDE_MANIFEST });
  return found;
}

/**
 * Selects the format of the package at `root`. An entry's `format:` wins and must name a
 * format that is present (`skills` is always accepted; the caller checks for skills).
 * Otherwise the highest-precedence manifest wins, with an `acf.source.format-selected`
 * info naming the manifests it ignored; no manifest means bare skills. Manifests are
 * never merged.
 */
export async function selectSourceFormat(
  root: string,
  requested?: SourceFormat,
): Promise<FormatSelection> {
  const recognized = await recognizedFormats(root);
  if (requested !== undefined) {
    if (requested === "skills" || recognized.some((item) => item.format === requested))
      return { format: requested, diagnostics: [] };
    return {
      format: undefined,
      diagnostics: [
        {
          severity: "error",
          code: "acf.source.format-not-found",
          message: `format: ${requested} names a format this source does not contain${
            recognized.length > 0
              ? ` (found ${recognized.map((item) => item.format).join(", ")})`
              : ""
          }`,
          path: root,
          data: { requested, found: recognized.map((item) => item.format) },
        },
      ],
    };
  }
  const [chosen, ...ignored] = recognized;
  if (chosen === undefined) return { format: "skills", diagnostics: [] };
  if (ignored.length === 0) return { format: chosen.format, diagnostics: [] };
  return {
    format: chosen.format,
    diagnostics: [
      {
        severity: "info",
        code: "acf.source.format-selected",
        message: `reading ${chosen.manifest} as ${chosen.format}; ignoring ${ignored
          .map((item) => item.manifest)
          .join(", ")} (set format: to choose another)`,
        path: path.join(root, chosen.manifest),
        data: { format: chosen.format, ignored },
      },
    ],
  };
}

/**
 * The `acf.source.marketplace-unsupported` error for a source that is only a plugin
 * marketplace, or undefined when `root` has no marketplace file. Suggestions are the
 * listed local plugin directories as `path:` values relative to `root`.
 */
export async function marketplaceDiagnostic(root: string): Promise<Diagnostic | undefined> {
  for (const relative of MARKETPLACES) {
    const file = path.join(root, relative);
    if (!(await isFile(file))) continue;
    const suggestions = marketplacePluginPaths(await parsedJson(file));
    return {
      severity: "error",
      code: "acf.source.marketplace-unsupported",
      message: `${relative} is a plugin marketplace; caplet installs one plugin per entry${
        suggestions.length > 0
          ? `. Add an entry per plugin with ${suggestions.map((item) => `path: ${item}`).join(", ")}`
          : ""
      }`,
      path: file,
      data: { suggestedPaths: suggestions },
    };
  }
  return undefined;
}

/** Local plugin directories a marketplace lists, normalized and deduplicated. */
function marketplacePluginPaths(marketplace: unknown): string[] {
  if (!isRecord(marketplace) || !Array.isArray(marketplace.plugins)) return [];
  const pluginRoot =
    isRecord(marketplace.metadata) && typeof marketplace.metadata.pluginRoot === "string"
      ? marketplace.metadata.pluginRoot
      : ".";
  const paths = new Set<string>();
  for (const plugin of marketplace.plugins) {
    const relative = localPluginSource(plugin, pluginRoot);
    if (relative === undefined) continue;
    const normalized = path.posix.normalize(relative).replace(/\/$/, "");
    if (normalized !== "." && !leavesBase(normalized)) paths.add(normalized);
  }
  return [...paths].sort();
}

/**
 * The marketplace-relative directory of a plugin entry with a local source: a `./` string as
 * written, another string under `pluginRoot`, or a `{ source: "local", path }` object's path.
 */
function localPluginSource(plugin: unknown, pluginRoot: string): string | undefined {
  if (!isRecord(plugin)) return undefined;
  const { source } = plugin;
  if (typeof source === "string")
    return source.startsWith("./") ? source : path.posix.join(pluginRoot, source);
  if (isRecord(source) && source.source === "local" && typeof source.path === "string")
    return source.path;
  return undefined;
}

/** Reads the package at `root` with the reader for `format`. */
export async function readForeignPackage(
  format: ForeignFormat,
  root: string,
  options: ForeignReadOptions,
): Promise<ForeignReadResult> {
  return format === "agent-plugins"
    ? await readAgentPluginsPackage(root, options)
    : await readClaudePluginPackage(root, options);
}

async function parsedJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}
