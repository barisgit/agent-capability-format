/**
 * What the collectors of the executable-component inventory (install-integrity, Executable change
 * report) share: the component types, the inventory each collector reads, the plugin package
 * layers, and the fingerprints of plugin configuration components.
 */
import { NATIVE_FILES_DIR } from "../extras/index.js";
import type { TreeFile } from "../hash/tree.js";
import type { AcfCapability, NativeRemainderKind, Scope, TargetId } from "../types/index.js";
import {
  byRel,
  componentStrings,
  fingerprint,
  packageRootReferences,
  type Snapshot,
  underAny,
  union,
} from "./snapshot.js";

/** What kind of executing code a component is: a remainder kind, or a file with the executable bit. */
export type ExecutableKind = NativeRemainderKind | "file";

/**
 * One component of a capability that executes code on one target (install-integrity,
 * Executable change report): a stdio MCP server, a hook, a file with the executable bit, or an
 * executable native remainder component. `fingerprint` changes whenever the code that runs or
 * how it is started changes, including files the command references inside the capability
 * through an ACF path placeholder or, for a stdio server, a relative path under its `cwd`.
 */
export type ExecutableComponent = {
  scope: Scope;
  capability: string;
  target: TargetId;
  kind: ExecutableKind;
  /** Unique per capability, target and kind: server name, `<event>/<hook>`, file path or remainder name. */
  name: string;
  /** What a reader checks: the command line, or the component's paths and manifest keys. */
  detail: string;
  fingerprint: string;
};

/** An executable component added, changed or removed between two inventories. */
export type ExecutableChange = Omit<ExecutableComponent, "fingerprint"> & {
  change: "added" | "changed" | "removed";
  /** The earlier `detail` of a changed component when it differs from the current one. */
  previous?: string | undefined;
};

/** What every collector of {@link executableComponents} reads: the capability after applicability. */
export type Inventory = {
  capability: AcfCapability;
  target: TargetId;
  pluginCarried: boolean;
  snapshot: Snapshot;
  base: Pick<ExecutableComponent, "scope" | "capability" | "target">;
};

/** Components plus the snapshot-relative paths they own, which no longer count as loose files. */
export type ClaimingComponents = { components: ExecutableComponent[]; claimed: string[] };

/**
 * Snapshot directories a plugin carrier for `target` builds its package from, highest precedence
 * first: `native/<target>/` over the capability's own files (SPEC.md §22.8.2). The carrier
 * leaves the default configuration files at the capability root out, so a default file only
 * counts from `native/<target>/`; a path a manifest key or a configuration names resolves in
 * these layers ({@link layeredPath}).
 */
export function packageLayers(target: TargetId): readonly [string, string] {
  return [`${NATIVE_FILES_DIR}/${target}`, ""];
}

/** Placeholders that name a plugin package's root in each remainder format. */
const packageRootPlaceholders: readonly string[] = ["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT"];

/**
 * Fingerprint of a plugin configuration component: its definition, its own files, and the files
 * its definition or files run through a package-root placeholder (`${CLAUDE_PLUGIN_ROOT}/...`),
 * resolved in `bases` ({@link packageRootReferences}). With `packageDir`, the package is built
 * from a native ACF capability's `native/<target>/` directory ({@link nativePackageFingerprint}).
 */
export async function runningFingerprint(
  snapshot: Snapshot,
  bases: readonly string[],
  definition: unknown,
  files: readonly TreeFile[],
  packageDir?: string,
): Promise<string> {
  const text = await componentStrings(definition, files);
  const referenced = packageRootReferences(snapshot, bases, packageRootPlaceholders, { text });
  const all = union(snapshot, files, referenced);
  return packageDir === undefined
    ? await fingerprint(definition, all)
    : await nativePackageFingerprint(packageDir, definition, all);
}

/**
 * Fingerprint of `definition` and `files` of the package a plugin carrier builds from the
 * capability's `native/<target>/` directory `packageDir` over its own files: files are hashed
 * package-relative and in byte order, as the same files of a foreign package are, and files in
 * the other targets' `native/` directories, which the package does not copy, are left out.
 */
export async function nativePackageFingerprint(
  packageDir: string,
  definition: unknown,
  files: readonly TreeFile[],
): Promise<string> {
  const prefix = `${packageDir}/`;
  const packageFiles = files
    .filter((file) => !underAny(file.rel, [NATIVE_FILES_DIR]) || file.rel.startsWith(prefix))
    .map((file) =>
      file.rel.startsWith(prefix) ? { ...file, rel: file.rel.slice(prefix.length) } : file,
    );
  return await fingerprint(definition, byRel(packageFiles));
}

/** `command` and `args` as one shell-quoted line, the `detail` of a server or hook. */
export function commandLine(command: string, args: readonly string[] | undefined): string {
  return [command, ...(args ?? [])].map(shellWord).join(" ");
}

function shellWord(value: string): string {
  return /^[\w@%+=:,./${}-]+$/.test(value) ? value : JSON.stringify(value);
}
