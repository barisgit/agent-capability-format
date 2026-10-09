/**
 * One read path for per-target raw extras (capability-model-layers, Inline native extras;
 * canonical-package-metadata, Per-target package values).
 *
 * File extras live under `native/<target>/` in the capability tree and are recorded on
 * `AcfCapability.nativeFiles`; read them through `nativeFiles` and `nativeFileTargets`.
 *
 * Inline extras live at every extension attachment point as `targets.<dialect>.native` (a map of
 * native keys in that dialect's own spelling), and at the package level of `acf.yml` also as
 * `targets.<target>.package` (native manifest values that replace the mapped core value for
 * that target). A dialect is a target id, or `agent-plugins` for Agent Plugins 1.0 keys that
 * no target in this change receives; only format readers write the `agent-plugins` dialect.
 *
 * Writers, readers and the plan read extras only through these functions so the storage
 * shape stays in one place.
 */
import type { NativeFileExtra } from "../types/interop.js";
import type { AcfCapability, Manifest, TargetExtensions, TargetId } from "../types/model.js";
import { isRecord } from "../utils/guards.js";

/** Owner of a set of native keys: a target id, or the Agent Plugins 1.0 dialect. */
export type ExtrasDialect = TargetId | "agent-plugins";
export const AGENT_PLUGINS_DIALECT = "agent-plugins" as const;

/** A map of native keys to values in one dialect's own spelling. */
export type NativeExtras = Readonly<Record<string, unknown>>;

function section(
  targets: TargetExtensions | undefined,
  dialect: ExtrasDialect,
  key: "native" | "package",
): NativeExtras {
  const entry = targets?.[dialect];
  if (!isRecord(entry)) return {};
  const value = entry[key];
  return isRecord(value) ? value : {};
}

/**
 * Native extras for `dialect` at one attachment point (skill frontmatter, MCP server or
 * manifest `targets`). Returns an empty map when none are declared; never undefined.
 */
export function nativeExtras(
  targets: TargetExtensions | undefined,
  dialect: ExtrasDialect,
): NativeExtras {
  return section(targets, dialect, "native");
}

/**
 * Returns `targets` with `values` merged into `targets.<dialect>.package`. Readers use it
 * to record foreign manifest values the core field cannot represent exactly (a non-SemVer
 * `version`, a Claude `author` with keys `PackageAuthor` has no field for).
 */
export function withPackageValues(
  targets: TargetExtensions | undefined,
  dialect: ExtrasDialect,
  values: NativeExtras,
): TargetExtensions {
  if (Object.keys(values).length === 0) return { ...(targets ?? {}) };
  const entry = isRecord(targets?.[dialect]) ? (targets?.[dialect] as Record<string, unknown>) : {};
  return {
    ...(targets ?? {}),
    [dialect]: { ...entry, package: { ...section(targets, dialect, "package"), ...values } },
  };
}

/** Package values (`targets.<dialect>.package`) declared on a manifest. */
export function packageValues(
  manifest: Pick<Manifest, "targets">,
  dialect: ExtrasDialect,
): NativeExtras {
  return section(manifest.targets, dialect, "package");
}

/**
 * Dialects that declare at least one native extra at this attachment point, in insertion
 * order. Writers use it to report `acf.extras.dropped` for every dialect other than their own.
 */
export function extrasDialects(targets: TargetExtensions | undefined): ExtrasDialect[] {
  if (targets === undefined) return [];
  return Object.keys(targets).filter(
    (dialect) => Object.keys(nativeExtras(targets, dialect)).length > 0,
  );
}

/**
 * Returns `targets` with `extras` merged into `targets.<dialect>.native`, creating the
 * nesting as needed. Existing keys in that map are overwritten; other dialects and other
 * keys of the dialect's entry are kept. Readers use it to record foreign native keys.
 */
export function withNativeExtras(
  targets: TargetExtensions | undefined,
  dialect: ExtrasDialect,
  extras: NativeExtras,
): TargetExtensions {
  if (Object.keys(extras).length === 0) return { ...(targets ?? {}) };
  const entry = isRecord(targets?.[dialect]) ? (targets?.[dialect] as Record<string, unknown>) : {};
  return {
    ...(targets ?? {}),
    [dialect]: { ...entry, native: { ...nativeExtras(targets, dialect), ...extras } },
  };
}

/** Directory of a capability that holds per-target file extras, one subdirectory per target. */
export const NATIVE_FILES_DIR = "native";

/** Files under `native/<target>/` of the capability, in reader order; empty when none. */
export function nativeFiles(
  capability: Pick<AcfCapability, "nativeFiles">,
  target: TargetId,
): readonly NativeFileExtra[] {
  return (capability.nativeFiles ?? []).filter((file) => file.target === target);
}

/**
 * Targets with at least one file under `native/<target>/`, sorted. Writers report
 * `nativeTreeDropped` for every target other than one they carry the files to.
 */
export function nativeFileTargets(capability: Pick<AcfCapability, "nativeFiles">): TargetId[] {
  return [...new Set((capability.nativeFiles ?? []).map((file) => file.target))].sort();
}
