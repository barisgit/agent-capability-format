/**
 * The executable-component inventory (install-integrity, Executable change report): which
 * components of a capability execute code on a target, gathered from the collectors beside this
 * module, and how two inventories differ.
 */
import { capabilityCarrier } from "../targets/index.js";
import type { AcfCapability, Carrier, TargetId } from "../types/index.js";
import {
  executableFiles,
  hookExecutables,
  stdioServerExecutables,
} from "./capability-executables.js";
import type {
  ExecutableChange,
  ExecutableComponent,
  ExecutableKind,
  Inventory,
} from "./executable-inventory.js";
import { applyApplicability } from "./index.js";
import {
  type NativeServers,
  nativeServerExecutables,
  pluginConfigExecutables,
} from "./plugin-executables.js";
import { remainderExecutables } from "./remainder-executables.js";
import { readSnapshot } from "./snapshot.js";

export type {
  ExecutableChange,
  ExecutableComponent,
  ExecutableKind,
} from "./executable-inventory.js";

const kindOrder: readonly ExecutableKind[] = [
  "mcp-server",
  "hook",
  "lsp-server",
  "monitor",
  "workflow",
  "bin",
  "file",
];

/**
 * Lists the components of `capability` that execute code on `target`, after the capability's
 * applicability (`only`/`except`) for that target: stdio MCP servers, hooks on targets that run
 * hooks, executable native remainder of a format `target` writes, the executable configuration a
 * plugin carrier writes from `native/<target>/` files and `targets.<target>.native` keys
 * (classified like the same component of a foreign package, one MCP server at a time, a native
 * server replacing the capability's server of its name), and files with the executable bit. A
 * file under a skill follows that skill's applicability, a file under `native/<t>/` reaches only
 * `t` through its plugin carrier (loose writers drop the tree), and files of a foreign package
 * reach only the target of its format or a plugin carrier, which copies the package's support
 * files. Files belonging to a remainder or native configuration component count toward that
 * component, not as separate files. `carrier` is the configured
 * `targets.<t>.carrier`; absent means the target default ({@link capabilityCarrier}).
 *
 * Reads the capability's snapshot to fingerprint referenced and executable files, so call it
 * while the snapshot still exists. Results are sorted by kind, then name.
 */
export async function executableComponents(
  capability: AcfCapability,
  target: TargetId,
  carrier?: Carrier,
): Promise<ExecutableComponent[]> {
  const filtered = applyApplicability(capability, target);
  if (filtered === null) return [];
  const inventory: Inventory = {
    capability: filtered,
    target,
    pluginCarried: capabilityCarrier(filtered, target, carrier) === "plugin",
    snapshot: await readSnapshot(filtered.root),
    base: { scope: filtered.scope, capability: filtered.manifest.name, target },
  };
  const hooks = await hookExecutables(inventory);
  const remainder = await remainderExecutables(inventory);
  const none: NativeServers = { components: [], claimed: [], names: new Set() };
  const pluginConfig = inventory.pluginCarried ? await pluginConfigExecutables(inventory) : none;
  const nativeServers = inventory.pluginCarried ? await nativeServerExecutables(inventory) : none;
  // A native server replaces the capability's server of the same name, as the host merges them.
  const servers = (await stdioServerExecutables(inventory)).filter(
    (server) => !nativeServers.names.has(server.name),
  );
  const components = [
    ...servers,
    ...hooks,
    ...remainder.components,
    ...pluginConfig.components,
    ...nativeServers.components,
    ...(await executableFiles(inventory, capability.skills, [
      ...remainder.claimed,
      ...pluginConfig.claimed,
      ...nativeServers.claimed,
    ])),
  ];
  return components.sort(byKindThenName);
}

/**
 * Compares two inventories from {@link executableComponents} by scope, capability, target, kind
 * and name. A component only in `after` is added, only in `before` removed, and in both with a
 * different fingerprint changed. Unchanged components produce nothing, so an empty result means
 * no executable component changed. Results are sorted by scope, capability, target, kind, name.
 */
export function executableChanges(
  before: readonly ExecutableComponent[],
  after: readonly ExecutableComponent[],
): ExecutableChange[] {
  const previous = new Map(before.map((item) => [identity(item), item]));
  const changes: ExecutableChange[] = [];
  for (const item of after) {
    const old = previous.get(identity(item));
    previous.delete(identity(item));
    const { fingerprint: current, ...rest } = item;
    if (old === undefined) changes.push({ ...rest, change: "added" });
    else if (old.fingerprint !== current) {
      changes.push({
        ...rest,
        change: "changed",
        ...(old.detail === item.detail ? {} : { previous: old.detail }),
      });
    }
  }
  for (const old of previous.values()) {
    const { fingerprint: _fingerprint, ...rest } = old;
    changes.push({ ...rest, change: "removed" });
  }
  return changes.sort(
    (a, b) =>
      a.scope.localeCompare(b.scope) ||
      a.capability.localeCompare(b.capability) ||
      a.target.localeCompare(b.target) ||
      byKindThenName(a, b),
  );
}

function identity(item: ExecutableComponent): string {
  return [item.scope, item.capability, item.target, item.kind, item.name].join("\u0000");
}

function byKindThenName(
  a: Pick<ExecutableComponent, "kind" | "name">,
  b: Pick<ExecutableComponent, "kind" | "name">,
): number {
  return kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name);
}

function kindRank(kind: ExecutableKind): number {
  const index = kindOrder.indexOf(kind);
  return index === -1 ? kindOrder.length : index;
}
