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
import type { BlockedCapability, EmittedDiff, PlannedPlugin } from "./workflow.js";

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
};

/** `<install-root>/.acf/marketplace/.claude-plugin/marketplace.json`. */
export function marketplaceFile(installRoot: string): string {
  return path.join(pluginMarketplaceDir(installRoot), ".claude-plugin", "marketplace.json");
}

/**
 * Plans the marketplace of each Claude install root in `roots`. It lists every plugin the plan
 * generates there, plus the installed plugin of each capability a refusal blocks on Claude in that
 * scope, because a blocked capability keeps its earlier install. `marketplace.json` is owned by
 * the reserved `acf-system` owner; it is deleted only when nothing is listed and the sidecar shows
 * caplet wrote it.
 */
export async function planClaudeMarketplaces(input: {
  roots: ReadonlyArray<{ scopeRoot: ScopeRoot; installRoot: string }>;
  plugins: readonly PlannedPlugin[];
  blocked: readonly BlockedCapability[];
}): Promise<{ roots: ClaudeRootPlan[]; diffs: EmittedDiff[] }> {
  const roots: ClaudeRootPlan[] = [];
  const diffs: EmittedDiff[] = [];
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
    roots.push({
      scopeRoot,
      installRoot,
      target,
      record: { name, scope: claudeScopeFor(scopeRoot.scope) },
      marketplaceDir,
      plugins,
      leftover,
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
  return { roots, diffs };
}

/**
 * The plugins the marketplace of `installRoot` lists, by name with their version: those the plan
 * generates there, and the installed one of each capability a refusal blocks on Claude in the
 * scope, read from its `plugin.json`.
 */
async function listedPlugins(
  scopeRoot: ScopeRoot,
  installRoot: string,
  input: { plugins: readonly PlannedPlugin[]; blocked: readonly BlockedCapability[] },
): Promise<Map<string, string>> {
  const listed = new Map<string, string>();
  for (const plugin of input.plugins) {
    if (plugin.target === "claude" && plugin.installRoot === installRoot) {
      listed.set(plugin.name, plugin.version);
    }
  }
  for (const item of input.blocked) {
    if (item.target !== "claude" || item.scope !== scopeRoot.scope) continue;
    if (listed.has(item.capability)) continue;
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
