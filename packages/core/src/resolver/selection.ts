import { computeSet } from "../applicability/index.js";
import { remainderFamilies, remainderTargets } from "../targets/remainder-support.js";
import type {
  AcfCapability,
  Diagnostic,
  FacetFamily,
  FacetSelector,
  HookFile,
  McpFile,
  TargetId,
} from "../types/index.js";
import { hookEntries, selectorKeys } from "../types/index.js";

/**
 * What a `capabilities.yml` entry installs of a resolved capability, as its lock entry
 * mirrors it: facet selection (`include`, `exclude`) and entry-level applicability (`only`,
 * `except`).
 */
export type EntrySelection = {
  include?: FacetSelector | undefined;
  exclude?: FacetSelector | undefined;
  only?: TargetId[] | undefined;
  except?: TargetId[] | undefined;
};

const families = Object.keys(selectorKeys) as FacetFamily[];

/**
 * Applies a `capabilities.yml` entry's selection to a resolved capability, native or foreign.
 * Entry `only`/`except` narrow the capability's targets by intersection with its own
 * applicability (SPEC.md §6.4). Then `include`, then `exclude` (SPEC.md §17.5, §20.5) select
 * components: `include` keeps only matching names in the families
 * it lists (an absent family keeps everything); `exclude` removes matching names. Names match
 * hook entry and MCP server names too, `*` and `?` glob within one name, and a foreign
 * package's native agents, commands, hooks and MCP servers are selected like facets. Returns
 * a new capability; the input is not modified.
 *
 * Diagnostics: `acf.selection.unmatched` (warn) for a pattern that matches nothing, and
 * `acf.selection.remainder-references` (lossy) when selection removes something from, or
 * `rename` renamed, a package whose preserved native components may still reference the
 * removed components or the old name.
 */
export function applyEntrySelection(
  resolved: AcfCapability,
  selection: EntrySelection,
): { capability: AcfCapability; diagnostics: Diagnostic[] } {
  const capability = narrowTargets(resolved, selection);
  if (isEmpty(selection.include) && isEmpty(selection.exclude))
    return { capability, diagnostics: remainderReferences(capability, capability) };
  const matchers = {
    include: selectorMatcher("include", selection.include),
    exclude: selectorMatcher("exclude", selection.exclude),
  };
  const keep = (family: FacetFamily, name: string): boolean =>
    matchers.include.allows(family, name) && !matchers.exclude.matches(family, name);
  const keepNamed = <T extends { name: string }>(family: FacetFamily, items: T[]): T[] =>
    items.filter((item) => keep(family, item.name));

  const selected: AcfCapability = {
    ...capability,
    skills: keepNamed("skill", capability.skills),
    agents: keepNamed("agent", capability.agents),
    commands: keepNamed("command", capability.commands),
    instructions: keepNamed("instruction", capability.instructions),
    hooks: selectHooks(capability.hooks, (name) => keep("hook", name)),
    mcp: selectMcp(capability.mcp, (name) => keep("mcp", name)),
  };
  const remainder = capability.remainder?.filter((item) => {
    const family = remainderFamilies[item.kind];
    return family === undefined || keep(family, item.name);
  });
  if (remainder !== undefined) selected.remainder = remainder;

  const diagnostics = [
    ...matchers.include.unmatched(capability),
    ...matchers.exclude.unmatched(capability),
    ...remainderReferences(capability, selected),
  ];
  return { capability: selected, diagnostics };
}

/**
 * The `acf.selection.remainder-references` warning when `selected` keeps native remainder that
 * was written against what selection removed from `capability` or against the package's name
 * before `rename`; empty when neither applies.
 */
function remainderReferences(capability: AcfCapability, selected: AcfCapability): Diagnostic[] {
  const preserved = selected.remainder?.length ?? 0;
  const removed = countComponents(capability) - countComponents(selected);
  const renamedFrom = capability.source?.renamedFrom;
  if (preserved === 0 || (removed === 0 && renamedFrom === undefined)) return [];
  const referenced = [
    ...(removed > 0 ? [`the ${removed} component(s) include/exclude removed`] : []),
    ...(renamedFrom === undefined ? [] : [`the package name ${renamedFrom} that rename replaced`]),
  ];
  return [
    {
      severity: "lossy",
      code: "acf.selection.remainder-references",
      message: `${capability.manifest.name} keeps ${preserved} native component(s) unchanged; they may still reference ${referenced.join(" and ")}`,
      path: capability.root,
      data: {
        capability: capability.manifest.name,
        removed,
        preserved,
        ...(renamedFrom === undefined ? {} : { renamedFrom }),
      },
    },
  ];
}

function narrowTargets(capability: AcfCapability, entry: EntrySelection): AcfCapability {
  if (entry.only === undefined && entry.except === undefined) return capability;
  const entryTargets = computeSet(entry);
  const manifest = { ...capability.manifest };
  delete manifest.except;
  manifest.only = computeSet(capability.manifest).filter((id) => entryTargets.includes(id));
  return { ...capability, manifest };
}

type SelectorMatcher = {
  /** Whether `name` matches a pattern listed for `family`. */
  matches(family: FacetFamily, name: string): boolean;
  /** Include semantics: true when `family` is not listed or `name` matches. */
  allows(family: FacetFamily, name: string): boolean;
  /** Warnings for patterns that match no component of `capability`. */
  unmatched(capability: AcfCapability): Diagnostic[];
};

function selectorMatcher(field: "include" | "exclude", selector: FacetSelector | undefined) {
  const patterns = (family: FacetFamily): string[] | undefined => selector?.[selectorKeys[family]];
  const matches = (family: FacetFamily, name: string): boolean =>
    (patterns(family) ?? []).some((pattern) => globMatches(pattern, name));
  return {
    matches,
    allows: (family, name) => patterns(family) === undefined || matches(family, name),
    unmatched(capability) {
      const diagnostics: Diagnostic[] = [];
      for (const family of families) {
        const names = componentNames(capability, family);
        for (const pattern of patterns(family) ?? []) {
          if (names.some((name) => globMatches(pattern, name))) continue;
          diagnostics.push({
            severity: "warn",
            code: "acf.selection.unmatched",
            message: `${field}.${selectorKeys[family]} pattern "${pattern}" matches no ${family} of ${capability.manifest.name}`,
            path: capability.root,
            family,
            data: { capability: capability.manifest.name, field, pattern },
          });
        }
      }
      return diagnostics;
    },
  } satisfies SelectorMatcher;
}

/** Selectable names of `family`; when a target is given, omit remainder it cannot carry. */
export function componentNames(
  capability: AcfCapability,
  family: FacetFamily,
  target?: TargetId,
): string[] {
  const native = (capability.remainder ?? [])
    .filter(
      (item) =>
        remainderFamilies[item.kind] === family &&
        (target === undefined || remainderTargets[item.format].includes(target)),
    )
    .map((item) => item.name);
  switch (family) {
    case "skill":
      return capability.skills.map((facet) => facet.name);
    case "agent":
      return [...capability.agents.map((facet) => facet.name), ...native];
    case "command":
      return [...capability.commands.map((facet) => facet.name), ...native];
    case "instruction":
      return capability.instructions.map((facet) => facet.name);
    case "hook":
      return [...hookEntries(capability.hooks).map(({ entry }) => entry.name), ...native];
    case "mcp":
      return [...(capability.mcp?.servers ?? []).map((server) => server.name), ...native];
  }
}

/** Selectable components: canonical facets plus family-mapped native remainder. */
function countComponents(capability: AcfCapability): number {
  return families.reduce((total, family) => total + componentNames(capability, family).length, 0);
}

function selectHooks(
  hooks: HookFile | undefined,
  keep: (name: string) => boolean,
): HookFile | undefined {
  if (hooks === undefined) return undefined;
  const buckets: HookFile["buckets"] = {};
  for (const [type, entries] of Object.entries(hooks.buckets) as Array<
    [keyof HookFile["buckets"], HookFile["buckets"][keyof HookFile["buckets"]]]
  >) {
    const kept = (entries ?? []).filter((entry) => keep(entry.name));
    if (kept.length > 0) buckets[type] = kept;
  }
  const selected: HookFile = { ...hooks, buckets };
  if (hooks.native !== undefined) {
    selected.native = Object.fromEntries(
      Object.entries(hooks.native).map(([target, events]) => [
        target,
        Object.fromEntries(
          Object.entries(events ?? {}).map(([event, entries]) => [
            event,
            entries.filter((entry) => keep(entry.name)),
          ]),
        ),
      ]),
    );
  }
  return selected;
}

function selectMcp(mcp: McpFile | undefined, keep: (name: string) => boolean): McpFile | undefined {
  if (mcp === undefined) return undefined;
  return { ...mcp, servers: mcp.servers.filter((server) => keep(server.name)) };
}

/** `*` matches any run of characters and `?` exactly one; everything else is literal. */
function globMatches(pattern: string, name: string): boolean {
  const source = pattern
    .split("")
    .map((char) =>
      char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.+^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${source}$`).test(name);
}

function isEmpty(selector: FacetSelector | undefined): boolean {
  return selector === undefined || Object.values(selector).every((names) => names === undefined);
}
