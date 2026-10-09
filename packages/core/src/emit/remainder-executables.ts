/**
 * Executable-inventory collector for a foreign package's executable native remainder, on the
 * targets that write its format.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLAUDE_PLUGIN_MANIFEST, remainderTargets } from "../targets/index.js";
import type { NativeRemainderComponent } from "../types/index.js";
import {
  type ClaimingComponents,
  type Inventory,
  runningFingerprint,
} from "./executable-inventory.js";
import { filesUnder, relativeTo } from "./snapshot.js";

/** Package manifest holding a format's manifest keys, relative to the package root. */
const manifestPaths: Readonly<Record<NativeRemainderComponent["format"], string>> = {
  "claude-plugin": CLAUDE_PLUGIN_MANIFEST,
  "agent-plugins": "plugin.json",
};

/**
 * Executable native remainder of a format `target` writes. Every remainder component claims its
 * paths, executable or not, so its files are not reported again as loose files.
 */
export async function remainderExecutables({
  capability,
  target,
  snapshot,
  base,
}: Inventory): Promise<ClaimingComponents> {
  const packageRoot = capability.source?.snapshotRoot ?? capability.root;
  const result: ClaimingComponents = { components: [], claimed: [] };
  for (const component of capability.remainder ?? []) {
    const prefixes = component.paths.map((item) =>
      relativeTo(snapshot.root, path.resolve(packageRoot, item)),
    );
    result.claimed.push(...prefixes);
    if (!component.executable || !remainderTargets[component.format].includes(target)) continue;
    result.components.push({
      ...base,
      kind: component.kind,
      name: component.name,
      detail: [
        ...component.paths,
        ...(component.manifestKeys ?? []).map((key) => `${manifestPaths[component.format]}#${key}`),
      ].join(", "),
      fingerprint: await runningFingerprint(
        snapshot,
        [relativeTo(snapshot.root, packageRoot)],
        await manifestValues(packageRoot, component),
        filesUnder(snapshot, prefixes),
      ),
    });
  }
  return result;
}

/** Values of the component's manifest keys; a manifest that is not JSON counts as a whole. */
async function manifestValues(
  packageRoot: string,
  component: NativeRemainderComponent,
): Promise<unknown> {
  const keys = component.manifestKeys ?? [];
  if (keys.length === 0) return null;
  let text: string;
  try {
    text = await readFile(path.join(packageRoot, manifestPaths[component.format]), "utf8");
  } catch {
    return null;
  }
  try {
    const manifest = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(keys.map((key) => [key, manifest[key] ?? null]));
  } catch {
    return text;
  }
}
