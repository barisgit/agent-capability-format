/** Shared-version eligibility and npm channel policy for main-push releases. */
import { compare, SemVer } from "semver";

function sharedVersion(versions: Readonly<Record<string, string>>): string {
  const values = Object.values(versions);
  const version = values[0];
  if (version === undefined || values.some((value) => value !== version)) {
    throw new Error("All root and published package versions must agree");
  }
  // SemVer's convenience parser also accepts a v prefix and whitespace; manifests must not.
  const parsed = new SemVer(version);
  const canonical = parsed.version + (parsed.build.length ? `+${parsed.build.join(".")}` : "");
  if (canonical !== version) throw new Error(`${version} is not canonical SemVer`);
  return version;
}

/** Unchanged versions skip publication; any change must increase SemVer precedence. */
export function evaluateVersions(
  previous: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
): { changed: boolean; version: string } {
  const version = sharedVersion(current);
  const before = sharedVersion(previous);
  if (version === before) return { changed: false, version };
  if (compare(version, before) <= 0)
    throw new Error("Release version must be newer than previous version");
  return { changed: true, version };
}

/** Stable releases, including 0.x, use latest; SemVer prereleases use next. */
export function releaseTag(version: string): "next" | "latest" {
  const build = version.indexOf("+");
  const base = build === -1 ? version : version.slice(0, build);
  return base.includes("-") ? "next" : "latest";
}
