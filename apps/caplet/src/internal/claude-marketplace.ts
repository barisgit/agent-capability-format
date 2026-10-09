/**
 * Plan side of the Claude plugin carrier (claude-plugin-output, Caplet-owned local marketplace):
 * which plugins each Claude install root's marketplace lists, and the `marketplace.json` diff that
 * keeps the listing in line with them.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ACF_SYSTEM_OWNER,
  type ClaudeMarketplaceRecord,
  pluginMarketplaceDir,
  pluginPackageDir,
  type ScopeRoot,
} from "@caplet/core";
import { readSidecar, relativeSidecarPath, writeSidecar } from "../apply/sidecar.js";
import type { DesiredClaudePlugin } from "../hosts/claude/plan.js";
import {
  type ClaudeScopeTarget,
  claudeMarketplaceName,
  claudeScopeFor,
  resolveClaudeScopeTarget,
} from "../hosts/claude/scope.js";
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
    const file = marketplaceFile(installRoot);
    const sidecar = await readSidecar(path.join(installRoot, ".acf-managed.json"));
    const owned = ownsMarketplaceFile(sidecar.managed, installRoot);
    const leftover = [
      ...new Set(
        sidecar.managed
          .filter((entry) => entry.carrier === "plugin" && entry.capability !== ACF_SYSTEM_OWNER)
          .map((entry) => entry.capability)
          .filter((capability) => !listed.has(capability)),
      ),
    ].sort();
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
        before: await readTextOrNull(file),
        after,
        owns: [{ kind: "file" }],
        artifactRoot: marketplaceDir,
      },
    });
  }
  return { roots, diffs };
}

/**
 * Brings the sidecar's marketplace record of each planned root in line with its files: recorded
 * while caplet owns `marketplace.json` there, cleared once the file is gone.
 */
export async function recordClaudeMarketplaces(roots: readonly ClaudeRootPlan[]): Promise<void> {
  for (const root of roots) {
    const sidecarPath = path.join(root.installRoot, ".acf-managed.json");
    const sidecar = await readSidecar(sidecarPath);
    const wanted = ownsMarketplaceFile(sidecar.managed, root.installRoot) ? root.record : undefined;
    const current = sidecar.marketplace;
    if (current?.name === wanted?.name && current?.scope === wanted?.scope) continue;
    if (wanted === undefined) delete sidecar.marketplace;
    else sidecar.marketplace = wanted;
    await writeSidecar(sidecarPath, sidecar);
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
  const text = await readTextOrNull(path.join(dir, ".claude-plugin", "plugin.json"));
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) return undefined;
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
