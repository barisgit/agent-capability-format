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
import type { DesiredClaudePlugin, DesiredClaudeScope } from "../hosts/claude/plan.js";
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
 * list retires the marketplace). A root appears when a selected capability may have an installed
 * plugin or its sidecar shows caplet maintained a marketplace or plugin there before.
 */
export type ClaudeRootPlan = {
  scopeRoot: ScopeRoot;
  installRoot: string;
  target: ClaudeScopeTarget;
  record: ClaudeMarketplaceRecord;
  marketplaceDir: string;
  plugins: DesiredClaudePlugin[];
  /**
   * Selected plugins blocked by a refusal or `held`, kept exactly as installed. The marketplace
   * keeps listing them, but they are never desired installs or updates, even with a readable
   * generated version. No command touches them or retires their marketplace.
   */
  kept: string[];
  /** Plugins whose generated files the sidecar still records but the plan no longer lists. */
  leftover: string[];
  /** Whether the sidecar records this marketplace as caplet's. */
  recorded: boolean;
  /**
   * Selected capabilities now without a plugin (`DesiredClaudeScope.retained`), independent of
   * whether the sidecar remembers their earlier plugin. Other left-over plugins were deselected
   * or removed.
   */
  retained: NonNullable<DesiredClaudeScope["retained"]>;
};

/** `<install-root>/.acf/marketplace/.claude-plugin/marketplace.json`. */
export function marketplaceFile(installRoot: string): string {
  return path.join(pluginMarketplaceDir(installRoot), ".claude-plugin", "marketplace.json");
}

/**
 * Plans the marketplace of each Claude install root in `roots`. It lists every plugin the plan
 * generates there, plus the installed plugin of each capability a refusal blocks on Claude in that
 * scope and of each `held` one, because those keep their earlier install. They are always `kept`,
 * never desired installs or updates. A held plugin with a readable version gets
 * `acf.claude.plugin-kept`; any kept plugin without one gets
 * `acf.claude.manifest-unreadable`. `marketplace.json`
 * is owned by the reserved `acf-system` owner; kept identities alone never create or claim it,
 * and it is deleted only when nothing is listed and the sidecar shows caplet wrote it.
 * Every `pluginless` capability is retained independently of sidecar history; any other
 * left-over plugin belongs to a capability the user deselected or removed.
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
    const sidecar = await readSidecar(sidecarPath(installRoot));
    const owned = ownsMarketplaceFile(sidecar.managed, installRoot);
    const generated = sidecarPlugins(sidecar.managed);
    const { listed, kept } = await listedPlugins(scopeRoot, installRoot, input);
    const keptNames = kept.map((item) => item.capability);
    const leftover = generated.filter((name) => !listed.has(name) && !keptNames.includes(name));
    const retained = await retainedPlugins(scopeRoot, installRoot, input.pluginless ?? []);
    const unused =
      listed.size === 0 && kept.length === 0 && leftover.length === 0 && retained.length === 0;
    if (unused && !owned && sidecar.marketplace === undefined) continue;

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
    diagnostics.push(...keptPluginDiagnostics(kept, installRoot, name));
    const root: ClaudeRootPlan = {
      scopeRoot,
      installRoot,
      target,
      record: { name, scope: claudeScopeFor(scopeRoot.scope) },
      marketplaceDir,
      plugins,
      recorded: sidecar.marketplace?.name === name,
      kept: keptNames,
      leftover,
      retained,
    };
    roots.push(root);
    const diff = await marketplaceDiff(root, owned, sidecar.marketplace !== undefined);
    if (diff !== undefined) diffs.push(diff);
  }
  return { roots, diffs, diagnostics };
}

/** Selection, not ownership history, identifies plugins whose data must be retained. */
async function retainedPlugins(
  scopeRoot: ScopeRoot,
  installRoot: string,
  pluginless: readonly PluginlessClaudeCapability[],
): Promise<ClaudeRootPlan["retained"]> {
  const retained = [];
  for (const selected of pluginless) {
    if (selected.scope !== scopeRoot.scope) continue;
    const declaresConfig = await declaresUserConfig(
      pluginPackageDir(installRoot, selected.capability),
    );
    retained.push({ name: selected.capability, output: selected.output, declaresConfig });
  }
  return retained;
}

function keptPluginDiagnostics(
  kept: readonly KeptPlugin[],
  installRoot: string,
  marketplace: string,
): Diagnostic[] {
  return kept.flatMap((item) => {
    if (item.manifestReadable) {
      return item.reason === "held"
        ? [pluginKeptDiagnostic(item, `${item.capability}@${marketplace}`)]
        : [];
    }
    const manifest = path.join(
      pluginPackageDir(installRoot, item.capability),
      CLAUDE_PLUGIN_MANIFEST,
    );
    return [manifestUnreadableDiagnostic(item, marketplace, manifest)];
  });
}

/** Retention alone must not create a marketplace or claim an unowned one. */
async function marketplaceDiff(
  root: ClaudeRootPlan,
  owned: boolean,
  previouslyRecorded: boolean,
): Promise<EmittedDiff | undefined> {
  if (root.plugins.length === 0 && !owned && !previouslyRecorded) return undefined;
  const listing = [...root.plugins, ...root.kept.map((name) => ({ name }))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const after = listing.length === 0 ? null : renderMarketplace(root.record.name, listing);
  if (after === null && !owned) return undefined;
  const file = marketplaceFile(root.installRoot);
  return {
    scopeRoot: root.scopeRoot,
    targetId: "claude",
    destination: "native",
    installRoot: root.installRoot,
    capabilityName: ACF_SYSTEM_OWNER,
    carrier: "plugin",
    diff: {
      path: file,
      before: await readTextIfExists(file),
      after,
      owns: [{ kind: "file" }],
      artifactRoot: root.marketplaceDir,
    },
  };
}

/**
 * `caplet remove` for `capability` at `scope`. The scope is explicit because, inside a project,
 * `caplet remove` defaults to project scope.
 */
function removeCommand(capability: string, scope: ScopeRoot["scope"]): string {
  return `caplet remove ${capability} --scope ${scope}`;
}

/** `acf.claude.plugin-kept`: the installed plugin `id` of a held capability stays as it is. */
function pluginKeptDiagnostic(held: HeldClaudePlugin, id: string): Diagnostic {
  return {
    severity: "warn",
    code: "acf.claude.plugin-kept",
    targetId: "claude",
    message: `Claude plugin \`${id}\` stays installed as it is: its reader left out an invalid component of ${held.capability}, and nothing else of it reaches Claude. Caplet uninstalls a plugin, deleting what Claude saved for it, only when its capability is deselected or removed. Fix the source, or run \`${removeCommand(held.capability, held.scope)}\` to uninstall it.`,
    data: { plugin: id },
  };
}

/** A still-selected capability whose installed plugin the marketplace keeps, and why. */
type KeptPlugin = HeldClaudePlugin & {
  reason: "refused" | "held";
  manifestReadable: boolean;
};

/**
 * `acf.claude.manifest-unreadable`: the installed plugin of a kept capability stays as it is and
 * its marketplace `marketplace` stays registered, because the version of the generated plugin
 * cannot be read from `manifest`.
 */
function manifestUnreadableDiagnostic(
  item: KeptPlugin,
  marketplace: string,
  manifest: string,
): Diagnostic {
  const id = `${item.capability}@${marketplace}`;
  const why =
    item.reason === "refused"
      ? "a refusal blocks it on Claude"
      : "its reader left out an invalid component and nothing else of it reaches Claude";
  return {
    severity: "warn",
    code: "acf.claude.manifest-unreadable",
    targetId: "claude",
    message: `Claude plugin \`${id}\` stays installed as it is and marketplace \`${marketplace}\` stays registered: ${item.capability} is still selected, ${why}, and caplet cannot read the plugin's version from its generated manifest ${manifest}, which is missing, unreadable, or names no version. Caplet uninstalls a plugin, deleting what Claude saved for it, only when its capability is deselected or removed. Fix the source so caplet generates the plugin again, or run \`${removeCommand(item.capability, item.scope)}\` to uninstall it.`,
    data: { plugin: id, manifest },
  };
}

/**
 * Separates plugins generated by this plan (`listed`, desired versions) from still-selected
 * blocked or held capabilities (`kept`, never installed or updated). Reading a kept manifest is
 * only for diagnostics; its version must not become desired host state.
 */
async function listedPlugins(
  scopeRoot: ScopeRoot,
  installRoot: string,
  input: {
    plugins: readonly PlannedPlugin[];
    blocked: readonly BlockedCapability[];
    held?: readonly HeldClaudePlugin[] | undefined;
  },
): Promise<{ listed: Map<string, string>; kept: KeptPlugin[] }> {
  const listed = new Map<string, string>();
  for (const plugin of input.plugins) {
    if (plugin.target === "claude" && plugin.installRoot === installRoot) {
      listed.set(plugin.name, plugin.version);
    }
  }
  const candidates = [
    ...input.blocked
      .filter((item) => item.target === "claude")
      .map((item) => ({
        scope: item.scope,
        capability: item.capability,
        reason: "refused" as const,
      })),
    ...(input.held ?? []).map((item) => ({ ...item, reason: "held" as const })),
  ];
  const kept: KeptPlugin[] = [];
  for (const item of candidates) {
    if (item.scope !== scopeRoot.scope || listed.has(item.capability)) continue;
    const version = await installedPluginVersion(pluginPackageDir(installRoot, item.capability));
    kept.push({ ...item, manifestReadable: version !== undefined });
  }
  return { listed, kept };
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
export function renderMarketplace(
  name: string,
  plugins: ReadonlyArray<Pick<DesiredClaudePlugin, "name">>,
): string {
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
  const manifest = await readPluginManifest(dir);
  if (manifest === undefined) return true;
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
  const manifest = await readPluginManifest(dir);
  return typeof manifest?.version === "string" ? manifest.version : undefined;
}

/** Missing or malformed manifests have no known fields; filesystem errors still propagate. */
async function readPluginManifest(dir: string): Promise<Record<string, unknown> | undefined> {
  const text = await readTextIfExists(path.join(dir, CLAUDE_PLUGIN_MANIFEST));
  if (text === null) return undefined;
  try {
    const manifest: unknown = JSON.parse(text);
    return isRecord(manifest) ? manifest : undefined;
  } catch {
    return undefined;
  }
}
