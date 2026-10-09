/**
 * Plan side of the Claude plugin carrier (claude-plugin-output, Caplet-owned local marketplace):
 * which plugins each Claude install root's marketplace lists, and the `marketplace.json` diff that
 * keeps the listing in line with them.
 */
import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  CLAUDE_PLUGIN_MANIFEST,
  type ClaudeMarketplaceRecord,
  type Diagnostic,
  isRecord,
  pluginMarketplaceDir,
  pluginPackageDir,
  type ScopeRoot,
} from "@caplet/core";
import {
  type ManagedEntry,
  readSidecar,
  relativeSidecarPath,
  sidecarPath,
  writeSidecar,
} from "../apply/sidecar.js";
import type { DesiredClaudePlugin } from "../hosts/claude/plan.js";
import {
  type ClaudeScopeTarget,
  claudeMarketplaceName,
  claudeScopeFor,
  resolveClaudeScopeTarget,
} from "../hosts/claude/scope.js";
import { readTextIfExists } from "./fs.js";
import type {
  BlockedCapability,
  EmittedDiff,
  HeldClaudePlugin,
  PlannedPlugin,
  PluginlessClaudeCapability,
} from "./workflow.js";

/**
 * The Claude marketplace of one install root as a plan sees it: every plugin it lists (an empty
 * list retires the marketplace). A root appears only when it lists a plugin or its sidecar shows
 * caplet maintained a marketplace or plugin there before.
 */
export type ClaudeRootPlan = {
  scopeRoot: ScopeRoot;
  installRoot: string;
  target: ClaudeScopeTarget;
  record: ClaudeMarketplaceRecord;
  marketplaceDir: string;
  plugins: DesiredClaudePlugin[];
  /** Plugins whose generated files the sidecar still records but the plan no longer lists. */
  leftover: string[];
  /** Whether the sidecar records this marketplace as caplet's. */
  recorded: boolean;
  /**
   * The left-over plugins whose capability the scope still selects for Claude
   * (`DesiredClaudeScope.retained`); every other left-over plugin's capability was deselected or
   * removed.
   */
  retained: { name: string; output: "loose" | "empty"; declaresConfig: boolean }[];
};

/** `<install-root>/.acf/marketplace/.claude-plugin/marketplace.json`. */
export function marketplaceFile(installRoot: string): string {
  return path.join(pluginMarketplaceDir(installRoot), ".claude-plugin", "marketplace.json");
}

/**
 * Plans the marketplace of each Claude install root in `roots`. It lists every plugin the plan
 * generates there, plus the installed plugin of each capability a refusal blocks on Claude in that
 * scope and of each `held` one, because those keep their earlier install; a listed held plugin
 * gets `acf.claude.plugin-kept`. `marketplace.json` is owned by the reserved `acf-system`
 * owner; it is deleted only when nothing is listed and the sidecar shows caplet wrote it.
 * A left-over plugin whose capability is `pluginless` is retained; any other left-over plugin
 * belongs to a capability the user deselected or removed.
 */
export async function planClaudeMarketplaces(input: {
  roots: ReadonlyArray<{ scopeRoot: ScopeRoot; installRoot: string }>;
  plugins: readonly PlannedPlugin[];
  blocked: readonly BlockedCapability[];
  held?: readonly HeldClaudePlugin[] | undefined;
  pluginless?: readonly PluginlessClaudeCapability[] | undefined;
}): Promise<{ roots: ClaudeRootPlan[]; diffs: EmittedDiff[]; diagnostics: Diagnostic[] }> {
  const roots: ClaudeRootPlan[] = [];
  const diffs: EmittedDiff[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const { scopeRoot, installRoot } of input.roots) {
    const listed = await listedPlugins(scopeRoot, installRoot, input);
    const file = marketplaceFile(installRoot);
    const sidecar = await readSidecar(sidecarPath(installRoot));
    const owned = ownsMarketplaceFile(sidecar.managed, installRoot);
    const leftover = sidecarPlugins(sidecar.managed).filter((name) => !listed.has(name));
    if (listed.size === 0 && leftover.length === 0 && !owned && sidecar.marketplace === undefined) {
      continue;
    }

    // The project root is the parent of the project's `.agents` directory.
    const target = await resolveClaudeScopeTarget(
      scopeRoot.scope,
      path.dirname(scopeRoot.agentsDir),
    );
    const name = claudeMarketplaceName(target);
    const plugins = [...listed]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([plugin, version]) => ({ name: plugin, version }));
    const marketplaceDir = pluginMarketplaceDir(installRoot);
    const retained: ClaudeRootPlan["retained"] = [];
    for (const plugin of leftover) {
      const selected = input.pluginless?.find(
        (item) => item.scope === scopeRoot.scope && item.capability === plugin,
      );
      if (selected === undefined) continue;
      const declaresConfig = await declaresUserConfig(pluginPackageDir(installRoot, plugin));
      retained.push({ name: plugin, output: selected.output, declaresConfig });
    }
    for (const held of input.held ?? []) {
      if (held.scope !== scopeRoot.scope || !listed.has(held.capability)) continue;
      diagnostics.push(pluginKeptDiagnostic(held, `${held.capability}@${name}`));
    }
    roots.push({
      scopeRoot,
      installRoot,
      target,
      record: { name, scope: claudeScopeFor(scopeRoot.scope) },
      marketplaceDir,
      plugins,
      recorded: sidecar.marketplace?.name === name,
      leftover,
      retained,
    });
    const after = plugins.length === 0 ? null : renderMarketplace(name, plugins);
    if (after === null && !owned) continue;
    diffs.push({
      scopeRoot,
      targetId: "claude",
      destination: "native",
      installRoot,
      capabilityName: ACF_SYSTEM_OWNER,
      carrier: "plugin",
      diff: {
        path: file,
        before: await readTextIfExists(file),
        after,
        owns: [{ kind: "file" }],
        artifactRoot: marketplaceDir,
      },
    });
  }
  return { roots, diffs, diagnostics };
}

/** `acf.claude.plugin-kept`: the installed plugin `id` of a held capability stays as it is. */
function pluginKeptDiagnostic(held: HeldClaudePlugin, id: string): Diagnostic {
  return {
    severity: "warn",
    code: "acf.claude.plugin-kept",
    targetId: "claude",
    message: `Claude plugin \`${id}\` stays installed as it is: its reader left out an invalid component of ${held.capability}, and nothing else of it reaches Claude. Caplet uninstalls a plugin, deleting what Claude saved for it, only when its capability is deselected or removed. Fix the source, or run \`caplet remove ${held.capability}\` to uninstall it.`,
    data: { plugin: id },
  };
}

/**
 * The plugins the marketplace of `installRoot` lists, by name with their version: those the plan
 * generates there, and the installed one of each capability a refusal blocks on Claude in the
 * scope or the plan holds there, read from its `plugin.json`.
 */
async function listedPlugins(
  scopeRoot: ScopeRoot,
  installRoot: string,
  input: {
    plugins: readonly PlannedPlugin[];
    blocked: readonly BlockedCapability[];
    held?: readonly HeldClaudePlugin[] | undefined;
  },
): Promise<Map<string, string>> {
  const listed = new Map<string, string>();
  for (const plugin of input.plugins) {
    if (plugin.target === "claude" && plugin.installRoot === installRoot) {
      listed.set(plugin.name, plugin.version);
    }
  }
  const kept = [...input.blocked.filter((item) => item.target === "claude"), ...(input.held ?? [])];
  for (const item of kept) {
    if (item.scope !== scopeRoot.scope || listed.has(item.capability)) continue;
    const version = await installedPluginVersion(pluginPackageDir(installRoot, item.capability));
    if (version !== undefined) listed.set(item.capability, version);
  }
  return listed;
}

/** The capabilities whose generated plugin files a sidecar records, sorted, each once. */
export function sidecarPlugins(managed: readonly ManagedEntry[]): string[] {
  const names = managed
    .filter((entry) => entry.carrier === "plugin" && entry.capability !== ACF_SYSTEM_OWNER)
    .map((entry) => entry.capability);
  return [...new Set(names)].sort();
}

/**
 * Brings the sidecar's marketplace record of each planned root in line with its files: recorded
 * while caplet owns `marketplace.json` there, cleared once the file is gone.
 */
export async function recordClaudeMarketplaces(roots: readonly ClaudeRootPlan[]): Promise<void> {
  for (const root of roots) {
    const sidecarFile = sidecarPath(root.installRoot);
    const sidecar = await readSidecar(sidecarFile);
    const wanted = ownsMarketplaceFile(sidecar.managed, root.installRoot) ? root.record : undefined;
    const current = sidecar.marketplace;
    if (current?.name === wanted?.name && current?.scope === wanted?.scope) continue;
    if (wanted === undefined) delete sidecar.marketplace;
    else sidecar.marketplace = wanted;
    await writeSidecar(sidecarFile, sidecar);
  }
}

/** The marketplace listing: each plugin by its relative `./plugins/<name>` source. */
export function renderMarketplace(name: string, plugins: readonly DesiredClaudePlugin[]): string {
  const manifest = {
    name,
    owner: { name: "caplet" },
    plugins: plugins.map((plugin) => ({ name: plugin.name, source: `./plugins/${plugin.name}` })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function ownsMarketplaceFile(
  managed: ReadonlyArray<{ path: string; capability: string }>,
  installRoot: string,
): boolean {
  const relative = relativeSidecarPath(installRoot, marketplaceFile(installRoot));
  return managed.some((entry) => entry.capability === ACF_SYSTEM_OWNER && entry.path === relative);
}

/**
 * Whether the generated plugin in `dir` declares configuration Claude prompts for and saves
 * per plugin: `userConfig`, a channel's `userConfig`, or an MCP bundle (HTTPS or `.mcpb`), whose
 * user configuration Claude saves too. A manifest that cannot be read counts as declaring it.
 */
async function declaresUserConfig(dir: string): Promise<boolean> {
  const text = await readTextIfExists(path.join(dir, CLAUDE_PLUGIN_MANIFEST));
  let manifest: unknown;
  try {
    manifest = text === null ? undefined : JSON.parse(text);
  } catch {
    return true;
  }
  if (!isRecord(manifest)) return true;
  const configured = (value: unknown) => isRecord(value) && Object.keys(value).length > 0;
  const channels = Array.isArray(manifest.channels) ? manifest.channels : [];
  const bundles = [manifest.mcpServers]
    .flat()
    .some((ref) => typeof ref === "string" && (/^https:\/\//.test(ref) || ref.endsWith(".mcpb")));
  return (
    configured(manifest.userConfig) ||
    channels.some((channel) => isRecord(channel) && configured(channel.userConfig)) ||
    bundles
  );
}

/** The `version` an existing generated plugin declares, or undefined when there is none. */
async function installedPluginVersion(dir: string): Promise<string | undefined> {
  const text = await readTextIfExists(path.join(dir, CLAUDE_PLUGIN_MANIFEST));
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) return undefined;
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}
