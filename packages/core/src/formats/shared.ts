/**
 * Rules every foreign format reader shares: package identity (name, version, authors),
 * the canonical URL and placeholder domains, JSON manifests and remainder bookkeeping
 * (source-format-readers, One package is one capability; canonical-mcp, Placeholders).
 */
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  CapabilityEntry,
  Diagnostic,
  NativeRemainderComponent,
  SafetyClass,
} from "../types/index.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `${NAME}`, spelled without a template literal so the placeholder stays literal. */
export function placeholder(name: string): string {
  return `$${"{"}${name}}`;
}

export const CAPABILITY_DIR = placeholder("ACF_CAPABILITY_DIR");
export const DATA_DIR = placeholder("ACF_DATA_DIR");

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// SemVer 2.0.0, the regular expression published at semver.org.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isSlug(value: string): boolean {
  return SLUG.test(value);
}

export function isSemVer(value: string): boolean {
  return SEMVER.test(value);
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
    return { ok: true, value: JSON.parse(await readFile(file, "utf8")) };
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

export async function isFile(file: string): Promise<boolean> {
  try {
    return (await lstat(file)).isFile();
  } catch {
    return false;
  }
}

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

export function posixRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/") || ".";
}

/** True when any of `paths` (relative to `root`) is a file with an executable bit. */
export async function anyExecutable(root: string, paths: readonly string[]): Promise<boolean> {
  for (const relative of paths) {
    for (const file of (await isDirectory(path.join(root, relative)))
      ? await filesUnder(root, path.join(root, relative))
      : [relative]) {
      try {
        if (((await lstat(path.join(root, file))).mode & 0o111) !== 0) return true;
      } catch {
        // A path named by a manifest but absent from the package executes nothing.
      }
    }
  }
  return false;
}

/** Builds a remainder component; `executable` is forced on for kinds that run code. */
export async function remainderComponent(
  root: string,
  input: Omit<NativeRemainderComponent, "executable" | "class"> & {
    class: SafetyClass;
    executable?: boolean;
  },
): Promise<NativeRemainderComponent> {
  const runsCode = input.executable ?? executableKinds.has(input.kind);
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

const executableKinds = new Set<NativeRemainderComponent["kind"]>([
  "hook",
  "lsp-server",
  "monitor",
  "bin",
]);

/** Canonical package identity of a foreign package. */
export type PackageIdentity = {
  name: string;
  version: string;
  /** The manifest version when it is not SemVer, for the source dialect's package values. */
  foreignVersion?: string | undefined;
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
  if (typeof input.version === "string" && isSemVer(input.version))
    return { identity: { name, version: input.version } };
  const identity: PackageIdentity = {
    name,
    version: `0.0.0-unversioned+${buildIdentifier(input.revision)}`,
  };
  if (typeof input.version === "string") identity.foreignVersion = input.version;
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

/** A structured foreign author (`{name, email?, url?}`). */
export type ForeignAuthor = { name: string; email?: string | undefined; url?: string | undefined };

/**
 * The `authors` entry for a foreign author and whether it round-trips: `Name <email>` when
 * decoding that string gives back the same name and email (canonical-package-metadata,
 * Legacy author strings), otherwise the name alone and `roundTrips: false`.
 */
export function authorEntry(author: ForeignAuthor): { entry: string; roundTrips: boolean } {
  const encoded = author.email === undefined ? author.name : `${author.name} <${author.email}>`;
  const decoded = decodeAuthor(encoded);
  const roundTrips =
    author.url === undefined && decoded.name === author.name && decoded.email === author.email;
  return roundTrips ? { entry: encoded, roundTrips } : { entry: author.name, roundTrips };
}

function decodeAuthor(value: string): { name: string; email?: string } {
  const match = /^(.*[^ ]) <([^<>]+)>$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) return { name: value };
  return { name: match[1], email: match[2] };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Why `value` is outside the canonical MCP URL domain (HTTPS, or HTTP to a loopback host;
 * no user information), or undefined when it is inside. Fragments are rejected when
 * `allowFragment` is false, as Agent Plugins 1.0 requires.
 */
export function urlProblem(value: string, allowFragment: boolean): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "is not a URL";
  }
  if (url.username !== "" || url.password !== "") return "carries user information";
  if (!allowFragment && url.hash !== "") return "has a fragment";
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return undefined;
  return "must use https, or http to a loopback host";
}

/** Inner text of every `${...}` placeholder in `value` (`NAME`, or `NAME:-default`). */
export function placeholderNames(value: string): string[] {
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
  if (placeholderNames(value).some((name) => mapping[name] === undefined)) return undefined;
  return value.replace(/\$\{([^}]*)\}/g, (_whole, name: string) => mapping[name] ?? "");
}

/** Manifest of a Claude plugin, relative to the plugin root. */
export const CLAUDE_MANIFEST = ".claude-plugin/plugin.json";

/** Component paths of a manifest value: a path or a list of paths; other entries ignored. */
export function componentPaths(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

/** `relative` resolved inside `root`, or undefined when it escapes the package. */
export function contained(root: string, relative: string): string | undefined {
  const resolved = path.resolve(root, relative);
  const back = path.relative(root, resolved);
  return back.startsWith("..") || path.isAbsolute(back) ? undefined : resolved;
}

export function outsidePackage(root: string, key: string, relative: string): Diagnostic {
  return {
    severity: "warn",
    code: "acf.source.component-invalid",
    message: `plugin.json ${key} path ${relative} leaves the plugin directory and is ignored`,
    path: path.join(root, CLAUDE_MANIFEST),
  };
}
