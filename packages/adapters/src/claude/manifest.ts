/**
 * The Claude plugin manifest (`.claude-plugin/plugin.json`) and the `+acf.<d>` version rule
 * (claude-plugin-output, Claude plugin package).
 *
 * One renderer serves native ACF capabilities and translated or transformed foreign packages, so
 * the same content authored either way yields the same manifest: mapped core metadata first, in
 * Claude's documented key order, with `targets.claude.package` values replacing mapped values,
 * then the package's own Claude keys in their authored order.
 */
import {
  type AcfCapability,
  nativeKeyInfo,
  type PackageAuthor,
  packageValues,
  type SupportSubject,
} from "@caplet/core";
import { setOwn } from "../common/records.js";
import { considerField, type EmitReport, emptyReport } from "../common/support-report.js";

/** Path of the manifest inside a Claude plugin package. */
export const CLAUDE_MANIFEST_PATH = ".claude-plugin/plugin.json";

/** Manifest keys generated from core metadata, in Claude's documented order. */
export const MAPPED_MANIFEST_KEYS = [
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
] as const;

/** A manifest whose `version` is filled in once the package digest is known. */
export type PluginManifest = {
  /** `targets.claude.package.version` when set, else the capability version. */
  baseVersion: string;
  render(version: string): string;
};

/**
 * The manifest of `capability`'s Claude plugin. `extras` are the package's own Claude keys in
 * order (package-level `targets.claude.native` for native ACF, the source's unprojected keys for
 * a Claude plugin); keys a core field generates are skipped. Support decisions for the package
 * fields go to `report`.
 */
export function pluginManifest(
  capability: AcfCapability,
  extras: ReadonlyArray<readonly [string, unknown]>,
  report: EmitReport,
): PluginManifest {
  const manifest = capability.manifest;
  const subject: SupportSubject = {
    capability: manifest.name,
    target: "claude",
    carrier: "plugin",
    family: "package",
    component: manifest.name,
  };
  const fields = emptyReport();
  const carried = (field: string): boolean => {
    const kind = considerField(fields, subject, field)?.kind;
    return kind === "native" || kind === "translated";
  };

  const mapped: Record<string, unknown> = {};
  if (carried("package.name")) mapped.name = manifest.name;
  carried("package.version");
  if (manifest.description !== undefined && carried("package.description"))
    mapped.description = manifest.description;
  const [first, ...additional] = manifest.authors ?? [];
  if (first !== undefined && carried("package.authors")) {
    const author = claudeAuthor(first);
    if (typeof first === "string" && author.email !== undefined)
      carried("package.authors=Name <email>");
    mapped.author = author;
  }
  if (additional.length > 0) carried("package.authors.additional");
  if (manifest.homepage !== undefined && carried("package.homepage"))
    mapped.homepage = manifest.homepage;
  if (manifest.repository !== undefined && carried("package.repository"))
    mapped.repository = manifest.repository;
  if (manifest.license !== undefined && carried("package.license"))
    mapped.license = manifest.license;
  if (manifest.keywords !== undefined && carried("package.keywords"))
    mapped.keywords = manifest.keywords;
  const values = packageValues(manifest, "claude");
  for (const [key, value] of Object.entries(values))
    if (key !== "version") setOwn(mapped, key, value);
  report.diagnostics.push(...fields.diagnostics);
  report.outcomes.push(...fields.outcomes);

  const own = extras.filter(
    ([key]) => nativeKeyInfo("claude", "package", key)?.generatedFrom === undefined,
  );
  return {
    baseVersion: typeof values.version === "string" ? values.version : manifest.version,
    render(version) {
      const entries: Array<readonly [string, unknown]> = [];
      for (const key of MAPPED_MANIFEST_KEYS) {
        const value = key === "version" ? version : mapped[key];
        if (value !== undefined) entries.push([key, value]);
      }
      entries.push(...own);
      return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
    },
  };
}

/**
 * The Claude `author` object for an ACF author. A string is decoded into name and email only
 * when it has the legacy form `Name <email>` and re-encoding reproduces it exactly; any other
 * string becomes the name.
 */
export function claudeAuthor(author: string | PackageAuthor): Record<string, string> {
  if (typeof author !== "string") {
    const out: Record<string, string> = { name: author.name };
    if (author.email !== undefined) out.email = author.email;
    if (author.url !== undefined) out.url = author.url;
    return out;
  }
  const match = /^(\S(?:.*\S)?) <([^<>\s]+)>$/.exec(author);
  const name = match?.[1];
  const email = match?.[2];
  if (
    name !== undefined &&
    email !== undefined &&
    `${name} <${email}>` === author &&
    !name.includes("<")
  )
    return { name, email };
  return { name: author };
}

/**
 * The published version for `base` and the package's `acf-tree-2` digest: `<base>+acf.<d>`, or
 * `<base>.acf.<d>` when `base` already has build metadata, with `d` the first 12 hex digits.
 */
export function pluginVersion(base: string, digest: string): string {
  const hex = digest.slice(digest.lastIndexOf(":") + 1).slice(0, 12);
  return `${base + (base.includes("+") ? "." : "+")}acf.${hex}`;
}
