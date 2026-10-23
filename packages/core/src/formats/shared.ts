/**
 * Rules every foreign format reader shares: package identity (name, version, authors),
 * the canonical URL and placeholder domains, JSON manifests and remainder bookkeeping
 * (source-format-readers, One package is one capability; canonical-mcp, Placeholders).
 */
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isExecutableMode } from "../hash/tree.js";
import { nativeValueProblem } from "../targets/native-keys.js";
import { CLAUDE_PLUGIN_MANIFEST } from "../targets/plugin-layout.js";
import type {
  CapabilityEntry,
  Diagnostic,
  InteropFamily,
  Manifest,
  NativeRemainderComponent,
  PackageAuthor,
  SafetyClass,
  TargetId,
} from "../types/index.js";
import { isRecord, isSlug, isStringArray } from "../utils/guards.js";
import { leavesBase } from "../utils/paths.js";
import { assertNoProtoKey } from "../utils/proto-key.js";
import { isSemVer } from "../utils/semver.js";

/**
 * Why a foreign component's native keys for its own `target` make it invalid: the first key whose
 * value is outside the domain the host documents, or undefined. The host rejects such a
 * component, and native ACF rejects the same value (`acf.extras.native-value-invalid`), so the
 * reader leaves the component out with a warning (capability-model-layers, Native ACF
 * expressiveness parity).
 */
export function nativeValuesProblem(
  target: TargetId,
  family: InteropFamily,
  extras: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const [key, value] of Object.entries(extras)) {
    const problem = nativeValueProblem(target, family, key, value);
    if (problem !== undefined) return `${key} is not a valid ${target} value: ${problem}`;
  }
  return undefined;
}

/**
 * `acf.source.component-invalid` (warn) for a skill or MCP server of a foreign or imported source
 * that is left out because of `reason`, such as a native value outside its host's domain; the
 * rest of the package still loads. Every source format reports such a component with this one
 * code and wording (design D27.4); native ACF reports the same value as an error instead.
 */
export function componentNotLoaded(
  family: "skill" | "mcp",
  name: string,
  reason: string,
  file: string,
): Diagnostic {
  const label = family === "skill" ? "skill" : "MCP server";
  return {
    severity: "warn",
    code: "acf.source.component-invalid",
    message: `${label} ${name} is not loaded: ${reason}`,
    path: file,
    family,
  };
}

/** Result of reading a JSON document: its value, or the error diagnostic it produced. */
export type JsonRead = { ok: true; value: unknown } | { ok: false; diagnostic: Diagnostic };

/** Reads `file` as JSON; a missing file or malformed text becomes `code` at `severity`. */
export async function readJson(
  file: string,
  code: string,
  severity: Diagnostic["severity"],
): Promise<JsonRead> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    assertNoProtoKey(value);
    return { ok: true, value };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      diagnostic: {
        severity,
        code,
        message: `cannot read ${path.basename(file)}: ${reason}`,
        path: file,
      },
    };
  }
}

/** True when `file` is a regular file (links are not followed). */
export async function isFile(file: string): Promise<boolean> {
  try {
    return (await lstat(file)).isFile();
  } catch {
    return false;
  }
}

/** True when `dir` is a directory (links are not followed). */
export async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await lstat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/** Regular files under `dir` as POSIX paths relative to `root`, sorted. */
export async function filesUnder(root: string, dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(posixRelative(root, full));
    }
  }
  if (await isDirectory(dir)) await walk(dir);
  return out.sort();
}

/** `file` relative to `root` with POSIX separators; `.` for the root itself. */
function posixRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/") || ".";
}

/** True when any of `paths` (relative to `root`) is a file with an executable bit. */
async function anyExecutable(root: string, paths: readonly string[]): Promise<boolean> {
  for (const relative of paths) {
    for (const file of (await isDirectory(path.join(root, relative)))
      ? await filesUnder(root, path.join(root, relative))
      : [relative]) {
      try {
        if (isExecutableMode((await lstat(path.join(root, file))).mode)) return true;
      } catch {
        // A path named by a manifest but absent from the package executes nothing.
      }
    }
  }
  return false;
}

/**
 * Builds a remainder component. It is executable when `input.executable` marks a kind that runs
 * code whatever its files' modes (the format's component table owns which kinds do), or when any
 * of its files has the executable bit.
 */
export async function remainderComponent(
  root: string,
  input: Omit<NativeRemainderComponent, "executable" | "class"> & {
    class: SafetyClass;
    executable?: boolean;
  },
): Promise<NativeRemainderComponent> {
  const runsCode = input.executable ?? false;
  const component: NativeRemainderComponent = {
    format: input.format,
    kind: input.kind,
    name: input.name,
    paths: input.paths,
    class: input.class,
    executable: runsCode || (await anyExecutable(root, input.paths)),
  };
  if (input.manifestKeys !== undefined && input.manifestKeys.length > 0)
    component.manifestKeys = input.manifestKeys;
  return component;
}

/** Canonical package identity of a foreign package. */
export type PackageIdentity = {
  name: string;
  version: string;
  /** The manifest version when it is not SemVer, for the source dialect's package values. */
  foreignVersion?: string | undefined;
  /** The manifest name when `rename` replaced it. */
  renamedFrom?: string | undefined;
};

/**
 * Name and version of a foreign package (source-format-readers, One package is one
 * capability). The name is the manifest name, or the entry's `rename`; it must be an ACF
 * slug. A version that is not SemVer 2.0.0 becomes `0.0.0-unversioned+<revision|local>`.
 */
export function packageIdentity(input: {
  manifestName: string;
  version: unknown;
  rename: CapabilityEntry["rename"];
  revision: string | null;
  manifestPath: string;
}): { identity: PackageIdentity } | { diagnostic: Diagnostic } {
  const renamed =
    typeof input.rename === "string" ? input.rename : input.rename?.[input.manifestName];
  const name = renamed ?? input.manifestName;
  if (!isSlug(name)) {
    const suggestion = suggestSlug(input.manifestName);
    return {
      diagnostic: {
        severity: "error",
        code: "acf.manifest.invalid-name",
        message: `package name ${JSON.stringify(input.manifestName)} is not an ACF slug; set rename: ${suggestion} on the capabilities.yml entry`,
        path: input.manifestPath,
        data: { name: input.manifestName, suggestedRename: suggestion },
      },
    };
  }
  const semver =
    typeof input.version === "string" && isSemVer(input.version) ? input.version : undefined;
  const identity: PackageIdentity = {
    name,
    version: semver ?? `0.0.0-unversioned+${buildIdentifier(input.revision)}`,
  };
  if (semver === undefined && typeof input.version === "string")
    identity.foreignVersion = input.version;
  if (name !== input.manifestName) identity.renamedFrom = input.manifestName;
  return { identity };
}

function buildIdentifier(revision: string | null): string {
  const cleaned = (revision ?? "").replace(/[^0-9A-Za-z-]/g, "");
  return cleaned.length > 0 ? cleaned : "local";
}

function suggestSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "capability";
}

/**
 * The structured `authors` entry for a validated foreign author: its `name`, `email` and `url`.
 * Keys outside those three are not part of `PackageAuthor`; a reader that allows them keeps
 * the whole foreign author as a package value of its dialect.
 */
export function packageAuthor(author: PackageAuthor): PackageAuthor {
  const entry: PackageAuthor = { name: author.name };
  if (author.email !== undefined) entry.email = author.email;
  if (author.url !== undefined) entry.url = author.url;
  return entry;
}

/** Manifest fields both plugin formats hold as strings when present. */
const MANIFEST_STRING_KEYS = ["version", "description", "homepage", "repository", "license"];

/** Author fields that `PackageAuthor` holds. */
export const AUTHOR_KEYS: ReadonlySet<string> = new Set(["name", "email", "url"]);

/**
 * The first type violation in the metadata both plugin formats share: the string fields,
 * `keywords` and `author`. `closedAuthor` also rejects author keys outside {@link AUTHOR_KEYS}.
 */
export function metadataProblem(
  raw: Record<string, unknown>,
  closedAuthor: boolean,
): string | undefined {
  for (const key of MANIFEST_STRING_KEYS) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") return `${key} must be a string`;
  }
  if (raw.keywords !== undefined && !isStringArray(raw.keywords))
    return "keywords must be a list of strings";
  return raw.author === undefined ? undefined : authorProblem(raw.author, closedAuthor);
}

function authorProblem(author: unknown, closed: boolean): string | undefined {
  if (!isRecord(author) || typeof author.name !== "string")
    return "author must be an object with a name";
  const unknown = closed ? Object.keys(author).find((key) => !AUTHOR_KEYS.has(key)) : undefined;
  if (unknown !== undefined) return `author has unknown key ${unknown}`;
  for (const key of ["email", "url"]) {
    if (author[key] !== undefined && typeof author[key] !== "string")
      return `author.${key} must be a string`;
  }
  return undefined;
}

/**
 * The core manifest of a foreign plugin whose metadata passed {@link metadataProblem}: its
 * identity plus the description, license, homepage, repository, keywords and author it declares.
 */
export function coreManifest(
  raw: Record<string, unknown>,
  identity: { name: string; version: string },
): Manifest {
  const manifest: Manifest = { acf: 1, name: identity.name, version: identity.version };
  if (typeof raw.description === "string") manifest.description = raw.description;
  if (typeof raw.license === "string") manifest.license = raw.license;
  if (typeof raw.homepage === "string") manifest.homepage = raw.homepage;
  if (typeof raw.repository === "string") manifest.repository = raw.repository;
  if (isStringArray(raw.keywords)) manifest.keywords = raw.keywords;
  if (isRecord(raw.author)) manifest.authors = [packageAuthor(raw.author as PackageAuthor)];
  return manifest;
}

/** Inner text of every `${...}` placeholder in `value` (`NAME`, or `NAME:-default`). */
function placeholderNames(value: string): string[] {
  return [...value.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1] ?? "");
}

/**
 * Rewrites the source format's path placeholders to their ACF spelling. Returns undefined
 * when `value` uses any other placeholder, because its meaning is pending in core
 * (canonical-mcp, Placeholders) and the whole server must stay native remainder.
 */
export function mapPlaceholders(
  value: string,
  mapping: Readonly<Record<string, string>>,
): string | undefined {
  // Own properties only: `${constructor}` must not resolve through Object.prototype.
  const mapped = (name: string): string | undefined =>
    Object.hasOwn(mapping, name) ? mapping[name] : undefined;
  if (placeholderNames(value).some((name) => mapped(name) === undefined)) return undefined;
  return value.replace(/\$\{([^}]*)\}/g, (_whole, name: string) => mapped(name) ?? "");
}

/** Component paths of a manifest value: a path or a list of paths; other entries ignored. */
export function componentPaths(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

/** `relative` resolved inside `root`, or undefined when it escapes the package. */
export function contained(root: string, relative: string): string | undefined {
  const resolved = path.resolve(root, relative);
  const back = path.relative(root, resolved);
  return leavesBase(back) ? undefined : resolved;
}

/** The warning for a Claude manifest component path that escapes the plugin directory. */
export function outsidePackage(root: string, key: string, relative: string): Diagnostic {
  return {
    severity: "warn",
    code: "acf.source.component-invalid",
    message: `plugin.json ${key} path ${relative} leaves the plugin directory and is ignored`,
    path: path.join(root, CLAUDE_PLUGIN_MANIFEST),
  };
}
