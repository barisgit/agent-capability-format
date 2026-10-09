/**
 * Migration from loose Claude files to plugins (claude-plugin-output, Migration from loose Claude
 * output and One-time invocation rename notice). A capability that became a Claude plugin keeps
 * its loose `.claude/` files until Claude reports the plugin registered; then caplet deletes the
 * files it wrote unchanged, releases the ones the user edited, and announces once per install
 * root that the skills are now invoked as `/<capability>:<skill>`.
 */
import path from "node:path";
import type { Diagnostic, Scope } from "@caplet/core";
import { colors } from "consola/utils";
import { resolveDiffPath } from "../apply/apply-diffs.js";
import { readSidecar, relativeSidecarPath, writeSidecar } from "../apply/sidecar.js";
import type { ClaudeGate } from "./claude-host-flow.js";
import { displayPath } from "./plan-view.js";
import type { EmittedDiff } from "./workflow.js";

/** A skill whose Claude invocation name changes from `from` to `to` when its plugin takes over. */
export type ClaudeRename = {
  scope: Scope;
  installRoot: string;
  capability: string;
  from: string;
  to: string;
  /** The retirement the rename belongs to; it happens only when this gate opens. */
  gate: ClaudeGate;
};

/**
 * A loose Claude artifact the user edited since caplet wrote it. The migration leaves it in place
 * and drops its sidecar entry once its gate opens.
 */
export type ClaudeRelease = {
  installRoot: string;
  /** Path as the sidecar records it. */
  path: string;
  absolutePath: string;
  capability: string;
  item: EmittedDiff;
  gate: ClaudeGate;
};

export type ClaudeMigration = { releases: ClaudeRelease[]; renames: ClaudeRename[] };

/**
 * Splits the planned retirements of loose Claude artifacts (changes behind a `registered` gate):
 * drifted ones become releases instead of deletes, and the retired skills of install roots that
 * have not shown the rename notice yet become renames. Returns the changes left to apply.
 */
export async function planClaudeMigration(
  diffs: readonly EmittedDiff[],
): Promise<{ diffs: EmittedDiff[]; migration: ClaudeMigration }> {
  const kept: EmittedDiff[] = [];
  const releases: ClaudeRelease[] = [];
  const renames = new Map<string, ClaudeRename>();
  const noticeShown = new Map<string, boolean>();
  for (const item of diffs) {
    const gate = item.gate;
    if (gate?.kind !== "registered") {
      kept.push(item);
      continue;
    }
    if (item.drifted === true) {
      const absolutePath = resolveDiffPath(item.installRoot, item.diff.path);
      releases.push({
        installRoot: item.installRoot,
        path: relativeSidecarPath(item.installRoot, absolutePath),
        absolutePath,
        capability: item.capabilityName,
        item,
        gate,
      });
    } else {
      kept.push(item);
    }
    const facet = item.diff.facet;
    if (facet?.family !== "skill") continue;
    if (!noticeShown.has(item.installRoot)) {
      const sidecar = await readSidecar(path.join(item.installRoot, ".acf-managed.json"));
      noticeShown.set(item.installRoot, sidecar.renameNoticeShown === true);
    }
    if (noticeShown.get(item.installRoot) === true) continue;
    const rename: ClaudeRename = {
      scope: item.scopeRoot.scope,
      installRoot: item.installRoot,
      capability: item.capabilityName,
      from: `/${facet.name}`,
      to: `/${item.capabilityName}:${facet.name}`,
      gate,
    };
    renames.set(`${item.installRoot}\0${rename.from}\0${rename.to}`, rename);
  }
  return { diffs: kept, migration: { releases, renames: [...renames.values()] } };
}

/**
 * The `acf.migration.drifted` warning for a released artifact: the path, the duplicate it now
 * causes next to the plugin, and how to remove it.
 */
export function driftedWarning(release: ClaudeRelease): Diagnostic {
  const { capability, absolutePath } = release;
  const facet = release.item.diff.facet;
  const pointer = release.item.diff.owns.find((own) => own.kind === "json-pointer")?.pointer;
  const server = pointer?.match(/^\/mcpServers\/([^/]+)$/)?.[1];
  const duplicate =
    facet?.family === "skill"
      ? `Claude loads skill ${facet.name} twice, as /${facet.name} from this file and as /${capability}:${facet.name} from the plugin`
      : server !== undefined
        ? `Claude starts MCP server ${server} from this file and from plugin ${capability}`
        : `it duplicates the copy in plugin ${capability}`;
  const removal =
    pointer === undefined
      ? `rm '${absolutePath}'`
      : `remove ${pointer} from ${displayPath(absolutePath)}`;
  return {
    severity: "warn",
    code: "acf.migration.drifted",
    message: `${displayPath(absolutePath)} was edited after caplet wrote it, so moving ${capability} to a Claude plugin left it in place and caplet no longer manages it. ${duplicate}. To remove it: ${removal}`,
    targetId: "claude",
    path: absolutePath,
    capability: { name: capability },
    data: { path: absolutePath, duplicate, removal },
  };
}

/** Records in each install root's sidecar that the rename notice was shown. */
export async function recordRenameNotices(renames: readonly ClaudeRename[]): Promise<void> {
  for (const installRoot of new Set(renames.map((rename) => rename.installRoot))) {
    const sidecarPath = path.join(installRoot, ".acf-managed.json");
    const sidecar = await readSidecar(sidecarPath);
    if (sidecar.renameNoticeShown === true) continue;
    sidecar.renameNoticeShown = true;
    await writeSidecar(sidecarPath, sidecar);
  }
}

/** The `--json` form of renames. */
export function renamesJson(
  renames: readonly ClaudeRename[],
): { scope: Scope; capability: string; from: string; to: string }[] {
  return renames.map(({ scope, capability, from, to }) => ({ scope, capability, from, to }));
}

/** The one-time notice: each old and new invocation name. */
export function renameLines(renames: readonly ClaudeRename[]): string[] {
  if (renames.length === 0) return [];
  return [
    colors.bold("Claude skills are now invoked through their plugins"),
    ...renames.map((rename) => `  ${rename.from} -> ${rename.to}`),
  ];
}
