import type {
  AcfCapability,
  Diagnostic,
  FacetFamily,
  FacetSelector,
  HookFile,
  McpFile,
  NativeRemainderKind,
} from "../types/index.js";
import { selectorKeys } from "../types/index.js";

/** A `capabilities.yml` entry's facet selection, as its lock entry mirrors it. */
export type FacetSelection = {
  include?: FacetSelector | undefined;
  exclude?: FacetSelector | undefined;
};

const families = Object.keys(selectorKeys) as FacetFamily[];

/** Remainder kinds a family selector reaches; other remainder kinds are selected only with the package. */
const remainderFamily: Partial<Record<NativeRemainderKind, FacetFamily>> = {
  agent: "agent",
  command: "command",
  hook: "hook",
  "mcp-server": "mcp",
};

/**
 * Applies a `capabilities.yml` entry's `include` then `exclude` (SPEC.md §17.5, §20.5) to a
 * resolved capability, native or foreign. `include` keeps only matching names in the families
 * it lists (an absent family keeps everything); `exclude` removes matching names. Names match
 * hook entry and MCP server names too, `*` and `?` glob within one name, and a foreign
 * package's native agents, commands, hooks and MCP servers are selected like facets. Returns
 * a new capability; the input is not modified.
 *
 * Diagnostics: `acf.selection.unmatched` (warn) for a pattern that matches nothing, and
 * `acf.selection.remainder-references` (lossy) when exclusion removes something from a
 * package whose preserved native components may still reference it.
 */
export function selectComponents(
  capability: AcfCapability,
  selection: FacetSelection,
): { capability: AcfCapability; diagnostics: Diagnostic[] } {
  if (isEmpty(selection.include) && isEmpty(selection.exclude))
    return { capability, diagnostics: [] };
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
    const family = remainderFamily[item.kind];
    return family === undefined || keep(family, item.name);
  });
  if (remainder !== undefined) selected.remainder = remainder;

  const diagnostics = [
    ...matchers.include.unmatched(capability),
    ...matchers.exclude.unmatched(capability),
  ];
  const removed = countComponents(capability) - countComponents(selected);
  const preserved = selected.remainder?.length ?? 0;
  if (removed > 0 && preserved > 0) {
    diagnostics.push({
      severity: "lossy",
      code: "acf.selection.remainder-references",
      message: `${capability.manifest.name} keeps ${preserved} native component(s) unchanged; they may still reference the ${removed} component(s) include/exclude removed`,
      path: capability.root,
      data: { capability: capability.manifest.name, removed, preserved },
    });
  }
  return { capability: selected, diagnostics };
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

/** Every selectable name of `family`: canonical facets plus native remainder components. */
function componentNames(capability: AcfCapability, family: FacetFamily): string[] {
  const native = (capability.remainder ?? [])
    .filter((item) => remainderFamily[item.kind] === family)
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
      return [...hookEntries(capability.hooks).map((entry) => entry.name), ...native];
    case "mcp":
      return [...mcpServers(capability.mcp).map((server) => server.name), ...native];
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
  if (hooks.targets !== undefined) {
    selected.targets = Object.fromEntries(
      Object.entries(hooks.targets).map(([target, extension]) => {
        if (extension?.hooks === undefined) return [target, extension];
        const events = Object.fromEntries(
          Object.entries(extension.hooks).map(([event, entries]) => [
            event,
            entries.filter((entry) => keep(entry.name)),
          ]),
        );
        return [target, { ...extension, hooks: events }];
      }),
    );
  }
  return selected;
}

function selectMcp(mcp: McpFile | undefined, keep: (name: string) => boolean): McpFile | undefined {
  if (mcp === undefined) return undefined;
  const selected: McpFile = { ...mcp, servers: mcp.servers.filter((server) => keep(server.name)) };
  if (mcp.targets !== undefined) {
    selected.targets = Object.fromEntries(
      Object.entries(mcp.targets).map(([target, extension]) => [
        target,
        extension?.servers === undefined
          ? extension
          : { ...extension, servers: extension.servers.filter((server) => keep(server.name)) },
      ]),
    );
  }
  return selected;
}

function hookEntries(hooks: HookFile | undefined) {
  const shared = Object.values(hooks?.buckets ?? {}).flatMap((entries) => entries ?? []);
  const targeted = Object.values(hooks?.targets ?? {}).flatMap((extension) =>
    Object.values(extension?.hooks ?? {}).flat(),
  );
  return [...shared, ...targeted];
}

function mcpServers(mcp: McpFile | undefined) {
  const targeted = Object.values(mcp?.targets ?? {}).flatMap(
    (extension) => extension?.servers ?? [],
  );
  return [...(mcp?.servers ?? []), ...targeted];
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
