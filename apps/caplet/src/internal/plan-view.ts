import os from "node:os";
import path from "node:path";
import { ACF_SYSTEM_OWNER } from "@caplet/core";
import { colors } from "consola/utils";
import { columns } from "./render.js";
import type { EmittedDiff, FootprintEntry, Reach } from "./workflow.js";

export type PlanAction = "create" | "update" | "delete";

export type PlanRow = {
  action: PlanAction;
  path: string;
  fileCount: number;
  capabilities: string[];
  notice: boolean;
};

export type PlanDestination = {
  label: string;
  installRoot: string;
  rows: PlanRow[];
};

export type PlanScope = {
  scope: "user" | "project";
  root: string;
  destinations: PlanDestination[];
};

export type PlanTotals = {
  scope: string;
  target: string;
  create: number;
  update: number;
  delete: number;
};

export type PlanChange = {
  scope: string;
  target: string;
  destination: "canonical" | "native";
  action: PlanAction;
  path: string;
  capabilities: string[];
  notice: boolean;
};

export type PlanView = {
  scopes: PlanScope[];
  totals: PlanTotals[];
  fileCount: number;
  changes: PlanChange[];
};

const ROLLUP_THRESHOLD = 3;

export function buildPlanView(
  diffs: readonly EmittedDiff[],
  options: { verbose?: boolean } = {},
): PlanView {
  const rawChanges: PlanChange[] = diffs.map((item) => ({
    scope: item.scopeRoot.scope,
    target: item.destination === "canonical" ? "canonical" : item.targetId,
    destination: item.destination,
    action: item.diff.after === null ? "delete" : item.diff.before === null ? "create" : "update",
    path: item.diff.path,
    capabilities: item.capabilityName === ACF_SYSTEM_OWNER ? [] : [item.capabilityName],
    notice: item.diff.managementNotice !== undefined,
  }));
  const merged = new Map<string, PlanChange>();
  for (const change of rawChanges) {
    const key = `${change.scope}\u0000${change.target}\u0000${change.path}\u0000${change.action}\u0000${change.notice}`;
    const existing = merged.get(key);
    if (existing === undefined) {
      merged.set(key, { ...change, capabilities: [...change.capabilities] });
      continue;
    }
    for (const name of change.capabilities) {
      if (!existing.capabilities.includes(name)) existing.capabilities.push(name);
    }
  }
  const changes = [...merged.values()];

  type DestinationBucket = {
    scope: "user" | "project";
    agentsDir: string;
    label: string;
    installRoot: string;
    files: PlanChange[];
    notices: Map<PlanAction, { count: number; capabilities: Set<string> }>;
  };
  const destinations = new Map<string, DestinationBucket>();
  const roots = new Map<string, { agentsDir: string; installRoot: string }>();
  for (const [index, item] of diffs.entries()) {
    const raw = rawChanges[index] as PlanChange;
    const key = `${raw.scope}\u0000${raw.target}`;
    if (!roots.has(key)) {
      roots.set(key, { agentsDir: item.scopeRoot.agentsDir, installRoot: item.installRoot });
    }
  }
  for (const change of changes) {
    const key = `${change.scope}\u0000${change.target}`;
    const root = roots.get(key) as { agentsDir: string; installRoot: string };
    const bucket: DestinationBucket = destinations.get(key) ?? {
      scope: change.scope as "user" | "project",
      agentsDir: root.agentsDir,
      label: change.target,
      installRoot: root.installRoot,
      files: [],
      notices: new Map(),
    };
    if (change.notice) {
      const notice = bucket.notices.get(change.action) ?? { count: 0, capabilities: new Set() };
      notice.count += 1;
      for (const name of change.capabilities) notice.capabilities.add(name);
      bucket.notices.set(change.action, notice);
    } else {
      bucket.files.push(change);
    }
    destinations.set(key, bucket);
  }

  const scopes = new Map<string, PlanScope>();
  const sortedDestinations = [...destinations.values()].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "user" ? -1 : 1;
    if (a.label === "canonical") return b.label === "canonical" ? 0 : -1;
    if (b.label === "canonical") return 1;
    return a.label.localeCompare(b.label);
  });
  for (const bucket of sortedDestinations) {
    const rows: PlanRow[] = [];
    for (const group of groupRows(bucket.files, options.verbose === true, bucket.installRoot)) {
      rows.push(group);
    }
    const noticeActions = [...bucket.notices.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [action, notice] of noticeActions) {
      rows.push({
        action,
        path: "managed notices",
        fileCount: notice.count,
        capabilities: [...notice.capabilities].sort(),
        notice: true,
      });
    }
    const scope = scopes.get(bucket.scope) ?? {
      scope: bucket.scope,
      root: displayPath(bucket.scope === "user" ? os.homedir() : path.dirname(bucket.agentsDir)),
      destinations: [],
    };
    scope.destinations.push({
      label: bucket.label,
      installRoot: displayPath(bucket.installRoot),
      rows,
    });
    scopes.set(bucket.scope, scope);
  }

  const orderedScopes = [...scopes.values()].sort((a, b) =>
    a.scope === b.scope ? 0 : a.scope === "user" ? -1 : 1,
  );

  const totalsMap = new Map<string, PlanTotals>();
  for (const change of changes) {
    const key = `${change.scope}\u0000${change.target}`;
    const totals = totalsMap.get(key) ?? {
      scope: change.scope,
      target: change.target,
      create: 0,
      update: 0,
      delete: 0,
    };
    totals[change.action] += 1;
    totalsMap.set(key, totals);
  }
  const totals = [...totalsMap.values()].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "user" ? -1 : 1;
    if (a.target === "canonical") return b.target === "canonical" ? 0 : -1;
    if (b.target === "canonical") return 1;
    return a.target.localeCompare(b.target);
  });

  return { scopes: orderedScopes, totals, fileCount: changes.length, changes };
}

function groupRows(files: PlanChange[], verbose: boolean, installRoot: string): PlanRow[] {
  type Group = { action: PlanAction; items: PlanChange[] };
  const groups = new Map<string, Group>();
  for (const file of files) {
    const relative = path.relative(installRoot, file.path);
    const topDir =
      relative.startsWith("..") || !relative.includes(path.sep)
        ? ""
        : (relative.split(path.sep)[0] as string);
    const capKey = [...file.capabilities].sort().join(",");
    const key = `${file.action}\u0000${capKey}\u0000${topDir}`;
    const group = groups.get(key) ?? { action: file.action, items: [] };
    group.items.push(file);
    groups.set(key, group);
  }
  const rows: PlanRow[] = [];
  for (const group of groups.values()) {
    const capabilities = [...new Set(group.items.flatMap((item) => item.capabilities))].sort();
    if (!verbose && group.items.length > ROLLUP_THRESHOLD) {
      const common = commonDirectory(group.items.map((item) => item.path));
      rows.push({
        action: group.action,
        path: relativeToRoot(common, installRoot, true),
        fileCount: group.items.length,
        capabilities,
        notice: false,
      });
      continue;
    }
    for (const item of group.items) {
      rows.push({
        action: item.action,
        path: relativeToRoot(item.path, installRoot, false),
        fileCount: 1,
        capabilities: [...item.capabilities].sort(),
        notice: false,
      });
    }
  }
  return rows.sort((a, b) => (a.path === b.path ? 0 : a.path < b.path ? -1 : 1));
}

function commonDirectory(paths: readonly string[]): string {
  const segmentLists = paths.map((entry) => entry.split(path.sep).slice(0, -1));
  const first = segmentLists[0] ?? [];
  const shared: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index] as string;
    if (!segmentLists.every((segments) => segments[index] === segment)) break;
    shared.push(segment);
  }
  return shared.join(path.sep);
}

function relativeToRoot(filePath: string, installRoot: string, directory: boolean): string {
  const relative = path.relative(installRoot, filePath);
  const value =
    relative.length > 0 && !relative.startsWith("..") ? relative : displayPath(filePath);
  return directory ? `${value}${path.sep}` : value;
}

export function displayPath(filePath: string): string {
  const home = os.homedir();
  const relative = path.relative(process.cwd(), filePath);
  if (relative.length === 0) return ".";
  if (!relative.startsWith("..") && process.cwd() !== home) return relative;
  if (filePath === home) return "~";
  if (filePath.startsWith(`${home}${path.sep}`)) return `~${filePath.slice(home.length)}`;
  return filePath;
}

export function planToJson(view: PlanView): unknown {
  return {
    changes: view.changes.map((change) => ({
      scope: change.scope,
      target: change.target,
      destination: change.destination,
      action: change.action,
      path: change.path,
      capabilities: change.capabilities,
      notice: change.notice,
    })),
    totals: view.totals,
    fileCount: view.fileCount,
  };
}

export function reachBlock(reach: Reach, scopes: readonly string[]): string[] {
  const lines: string[] = [];
  const bySource = new Map<string, number>();
  for (const item of reach.sources) {
    bySource.set(item.source, (bySource.get(item.source) ?? 0) + item.capabilities);
  }
  if (bySource.size > 0) {
    lines.push(colors.dim("sources"));
    const rows = [...bySource.entries()].map(([source, capabilities]) => [
      shortenSource(source),
      colors.dim(`${capabilities} ${capabilities === 1 ? "capability" : "capabilities"}`),
    ]);
    lines.push(...columns(rows, { indent: "    " }));
  }
  const byScope = new Map<string, string[]>();
  for (const item of reach.targets) {
    const list = byScope.get(item.scope) ?? [];
    list.push(`${item.destination} ${colors.dim(displayPath(item.installRoot))}`);
    byScope.set(item.scope, list);
  }
  lines.push(colors.dim("targets"));
  const rows: string[][] = [];
  for (const scope of scopes) {
    const roots = byScope.get(scope) ?? [];
    if (roots.length === 0) {
      rows.push([colors.bold(scope), colors.dim("(nothing managed yet)")]);
      continue;
    }
    const shown = roots.slice(0, 4);
    const more = roots.length - shown.length;
    rows.push([
      colors.bold(scope),
      shown.join(" \u00b7 ") + (more > 0 ? colors.dim(` \u00b7 +${more} more`) : ""),
    ]);
  }
  lines.push(...columns(rows, { indent: "    " }));
  return lines;
}

export function footprintLines(
  footprint: readonly FootprintEntry[],
  options?: { indent?: string; skipScopeHeader?: boolean },
): string[] {
  const baseIndent = options?.indent ?? "";
  const lines: string[] = [];
  let scope: string | null = null;
  let target: string | null = null;
  let rows: string[][] = [];
  const flush = () => {
    if (rows.length > 0) lines.push(...columns(rows, { indent: `${baseIndent}    ` }));
    rows = [];
  };
  for (const entry of footprint) {
    if (entry.scope !== scope) {
      flush();
      if (scope !== null && options?.skipScopeHeader !== true) lines.push("");
      scope = entry.scope;
      target = null;
      if (options?.skipScopeHeader !== true) lines.push(colors.bold(entry.scope));
    }
    if (entry.target !== target) {
      flush();
      target = entry.target;
      lines.push(
        `${baseIndent}  ${colors.bold(entry.target)} ${colors.dim(displayPath(entry.installRoot))}`,
      );
    }
    const label =
      entry.kind === "region" ? `${entry.path} ${colors.dim("(managed region)")}` : entry.path;
    rows.push([label, colors.dim(entry.capability)]);
  }
  flush();
  return lines;
}

export function footprintToJson(footprint: readonly FootprintEntry[]): unknown[] {
  return footprint.map((entry) => ({
    scope: entry.scope,
    target: entry.target,
    installRoot: entry.installRoot,
    path: entry.path,
    kind: entry.kind,
    capability: entry.capability,
  }));
}

export function shortenSource(source: string): string {
  if (source.startsWith("path:")) return `path:${displayPath(source.slice(5))}`;
  return source;
}

export function reachToJson(reach: Reach): { sources: unknown[]; targets: unknown[] } {
  return {
    sources: reach.sources.map((item) => ({
      scope: item.scope,
      source: item.source,
      capabilities: item.capabilities,
    })),
    targets: reach.targets.map((item) => ({
      scope: item.scope,
      destination: item.destination,
      installRoot: item.installRoot,
      files: item.files,
    })),
  };
}
