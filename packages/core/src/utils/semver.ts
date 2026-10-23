// SemVer 2.0.0, the regular expression published at semver.org.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** True only for a complete SemVer 2.0.0 version, without coercion or whitespace. */
export function isSemVer(value: string): boolean {
  // `$` may match before a final newline; require the match to consume the whole input.
  return SEMVER.exec(value)?.[0] === value;
}
