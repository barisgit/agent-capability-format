import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type CloneOptions = {
  url: string;
  destination: string;
  ref?: string | undefined;
  blobless?: boolean | undefined;
  /**
   * HTTP header (for example `Authorization: Basic ...`) sent only for requests
   * under `url`. It is passed through GIT_CONFIG_* environment variables so the
   * credential never appears in argv, error messages, or the cloned repo config.
   */
  authHeader?: string | undefined;
};

type ShallowCloneOptions = CloneOptions & { ref: string };

export async function cloneShallow(opts: ShallowCloneOptions): Promise<void> {
  const args = ["clone", "--depth", "1", "--branch", opts.ref];
  if (opts.blobless === true) args.push("--filter=blob:none");
  await clone(args, opts);
}

export async function cloneFull(opts: CloneOptions): Promise<void> {
  const args = ["clone"];
  if (opts.blobless === true) args.push("--filter=blob:none");
  const gitOptions = await clone(args, opts);
  // A blobless checkout may fetch missing objects. Keep the same ephemeral auth
  // for both checkout attempts, including the lazy-fetch subprocesses they spawn.
  if (opts.ref !== undefined) await fetchRef(opts.destination, opts.ref, gitOptions);
}

async function clone(args: string[], opts: CloneOptions): Promise<RunGitOptions> {
  // Strip explicit HTTP credentials before invoking git: origin must never store
  // them, even when cloning fails. SSH URLs remain unchanged.
  const remote = stripHttpUserinfo(opts.url);
  let authHeader = opts.authHeader;
  if (remote !== opts.url && authHeader === undefined) {
    const url = new URL(opts.url);
    const credential = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    authHeader = `Authorization: Basic ${Buffer.from(credential).toString("base64")}`;
  }

  const gitOptions: RunGitOptions =
    authHeader === undefined
      ? {}
      : {
          env: gitConfigEnv(`http.${remote}.extraHeader`, authHeader),
          secrets: authSecrets(authHeader),
        };
  args.push(remote, opts.destination);
  await runGit(args, undefined, gitOptions);
  return gitOptions;
}

export async function fetchRef(
  repoDir: string,
  ref: string,
  opts: RunGitOptions = {},
): Promise<void> {
  try {
    await runGit(["checkout", "--detach", ref], repoDir, opts);
  } catch (error) {
    if (looksLikeSha(ref)) throw error;
    await runGit(["checkout", "--detach", `origin/${ref}`], repoDir, opts);
  }
}

export async function revParseHead(repoDir: string): Promise<string> {
  const { stdout } = await runGit(["rev-parse", "HEAD"], repoDir);
  return stdout.trim();
}

export function looksLikeSha(ref: string | undefined): boolean {
  return ref !== undefined && /^[a-f0-9]{40}$/i.test(ref);
}

type RunGitOptions = {
  env?: Record<string, string> | undefined;
  /** Literal values to mask in error messages, in addition to URL userinfo. */
  secrets?: string[] | undefined;
};

async function runGit(
  args: string[],
  cwd?: string | undefined,
  opts: RunGitOptions = {},
): Promise<{ stdout: string }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT ?? "0",
        ...opts.env,
      },
    });
    return { stdout: String(result.stdout) };
  } catch (error) {
    const message = `git ${args.join(" ")} failed: ${gitErrorMessage(error)}`;
    throw new Error(redact(message, opts.secrets ?? []));
  }
}

/**
 * Adds one config entry via GIT_CONFIG_COUNT/KEY/VALUE (git >= 2.31), appending
 * after any entries the caller's environment already defines.
 */
function gitConfigEnv(key: string, value: string): Record<string, string> {
  const existing = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "0", 10);
  const index = Number.isNaN(existing) || existing < 0 ? 0 : existing;
  return {
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: key,
    [`GIT_CONFIG_VALUE_${index}`]: value,
  };
}

// Matches the userinfo part of http(s) URLs, e.g. `https://user:secret@`.
const HTTP_USERINFO = /\b(https?:[/][/])[^\s/@'"]+@/gi;

function stripHttpUserinfo(url: string): string {
  return url.replace(HTTP_USERINFO, "$1");
}

function redact(text: string, secrets: string[]): string {
  let result = text.replace(HTTP_USERINFO, "$1***@");
  for (const secret of secrets) {
    if (secret.length > 0) result = result.split(secret).join("***");
  }
  return result;
}

function authSecrets(header: string): string[] {
  const encoded = header.trim().split(/\s+/).pop() ?? "";
  const secrets = [header, encoded];
  if (/^Authorization:\s+Basic\s+/i.test(header)) {
    const credential = Buffer.from(encoded, "base64").toString("utf8");
    const password = credential.slice(credential.indexOf(":") + 1);
    // Diagnostics can echo decoded or URL-encoded credentials outside a URL.
    secrets.push(credential, password, encodeURIComponent(password));
  }
  return secrets;
}

function gitErrorMessage(error: unknown): string {
  if (!isRecord(error)) return String(error);
  const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
  const message = error.message;
  if (stderr.length > 0) return stderr;
  if (typeof message === "string") return message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
