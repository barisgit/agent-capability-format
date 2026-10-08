/**
 * One read path for per-target raw extras (capability-model-layers, Inline native extras;
 * canonical-package-metadata, Per-target package values).
 *
 * Extras live at every extension attachment point as `targets.<dialect>.native` (a map of
 * native keys in that dialect's own spelling), and at the package level of `acf.yml` also as
 * `targets.<target>.package` (native manifest values that replace the mapped core value for
 * that target). A dialect is a target id, or `agent-plugins` for Agent Plugins 1.0 keys that
 * no target in this change receives; only format readers write the `agent-plugins` dialect.
 *
 * Writers, readers and the plan read extras only through these functions so the storage
 * shape stays in one place.
 */
import type { Manifest, TargetExtensions, TargetId } from "../types/model.js";

/** Owner of a set of native keys: a target id, or the Agent Plugins 1.0 dialect. */
export type ExtrasDialect = TargetId | "agent-plugins";
export const AGENT_PLUGINS_DIALECT = "agent-plugins" as const;

/** A map of native keys to values in one dialect's own spelling. */
export type NativeExtras = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
 * `version`, an `author` that does not round-trip through `authors`).
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
