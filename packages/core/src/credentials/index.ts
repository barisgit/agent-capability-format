/**
 * Credential detection and redaction for URLs that caplet writes or echoes.
 *
 * Source URLs must not carry credentials (SPEC.md §18): they would be written to
 * capabilities.yml, the lockfile and the cache, and echoed in plans and errors. MCP server URLs
 * must not carry userinfo (canonical-mcp, Canonical MCP server fields). This module detects
 * userinfo and credential-looking query or fragment parameters, and masks every credential part
 * so that messages can name the URL without leaking it.
 */

const SCHEME_URL = /^([a-z][a-z0-9+.-]*:[/][/])([^/?#]*)([^?#]*)(?:[?]([^#]*))?(?:#(.*))?$/is;
// scp-like `[user@]host:path`, which git treats as SSH.
const SCP_LIKE = /^([^/@:]+(?::[^/@]*)?)@([^/:]+:.*)$/s;
const SSH_SCHEMES = new Set(["ssh://", "git+ssh://", "ssh+git://"]);
const CREDENTIAL_KEY =
  /token|auth|pass(?:word)?|^pwd$|secret|api[-_]?key|access[-_]?key|private[-_]?key|^key$|^sig$|signature|credential|session/i;
// Well-known token prefixes: GitHub, GitLab, Slack.
const TOKEN_VALUE = /^(?:gh[pousr]_|github_pat_|glpat-|xox[abprs]-)/;
const MASK = "***";

/** Diagnostic code for a rejected credential-bearing source URL. */
export const CREDENTIAL_IN_URL = "acf.source.credential-in-url";

/**
 * Returns the user-facing rejection message for a source URL that embeds credentials, or `null`
 * for a credential-free URL. SSH user names (`git@host`) are not credentials and pass; an SSH
 * password does not. The message never contains the credential itself.
 */
export function sourceUrlCredentialProblem(url: string): string | null {
  const found = findUrlCredentials(url);
  if (found === null) return null;
  return (
    `source URL must not embed credentials (${found.reason}): ` +
    `${found.redacted}. Use GITHUB_TOKEN with a github: source, SSH, or a git credential ` +
    "helper instead (SPEC.md §18)."
  );
}

/** Credential parts found in a URL, with the URL rewritten so that each part is masked. */
export type UrlCredentials = {
  /** Human-readable kinds of credential found, e.g. `userinfo, query parameter "token"`. */
  reason: string;
  /** True when the authority carries userinfo that is a credential (not an SSH user name). */
  userinfo: boolean;
  /** The URL with every credential part replaced by `***`. */
  redacted: string;
};

/**
 * Finds userinfo and credential-looking query or fragment parameters in `url`; returns null for
 * a credential-free URL. SSH user names (`git@host`) are not credentials; an SSH password is.
 */
export function findUrlCredentials(url: string): UrlCredentials | null {
  const parsed = SCHEME_URL.exec(url);
  if (parsed === null) return inspectScpLike(url);
  const [, scheme = "", authority = "", rest = "", query, fragment] = parsed;
  const reasons: string[] = [];
  let redactedAuthority = authority;
  const at = authority.lastIndexOf("@");
  if (at >= 0) {
    const userinfo = authority.slice(0, at);
    if (!SSH_SCHEMES.has(scheme.toLowerCase()) || userinfo.includes(":")) {
      reasons.push("userinfo");
      redactedAuthority = `${MASK}@${authority.slice(at + 1)}`;
    }
  }
  const redactedQuery = query === undefined ? undefined : maskParameters(query, "query", reasons);
  const redactedFragment =
    fragment === undefined ? undefined : maskParameters(fragment, "fragment", reasons);
  if (reasons.length === 0) return null;
  const redacted =
    scheme +
    redactedAuthority +
    rest +
    (redactedQuery === undefined ? "" : `?${redactedQuery}`) +
    (redactedFragment === undefined ? "" : `#${redactedFragment}`);
  return {
    reason: [...new Set(reasons)].join(", "),
    userinfo: reasons.includes("userinfo"),
    redacted,
  };
}

function inspectScpLike(url: string): UrlCredentials | null {
  const parsed = SCP_LIKE.exec(url);
  if (parsed === null || !(parsed[1] ?? "").includes(":")) return null;
  return { reason: "userinfo", userinfo: true, redacted: `${MASK}@${parsed[2] ?? ""}` };
}

/** Masks credential-looking `key=value` parameters (or a bare token) and records why. */
function maskParameters(text: string, part: "query" | "fragment", reasons: string[]): string {
  return text
    .split("&")
    .map((parameter) => {
      const equals = parameter.indexOf("=");
      const key = equals < 0 ? "" : decode(parameter.slice(0, equals));
      const value = decode(equals < 0 ? parameter : parameter.slice(equals + 1));
      if (!CREDENTIAL_KEY.test(key) && !TOKEN_VALUE.test(value)) return parameter;
      reasons.push(key === "" ? part : `${part} parameter "${key}"`);
      return equals < 0 ? MASK : `${parameter.slice(0, equals)}=${MASK}`;
    })
    .join("&");
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
