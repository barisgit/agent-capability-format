import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isRecord } from "@caplet/core";

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

/** Clones only `ref`, a branch or tag, at depth 1 into `destination`. */
export async function cloneShallow(opts: ShallowCloneOptions): Promise<void> {
  const args = ["clone", "--depth", "1", "--branch", opts.ref];
  if (opts.blobless === true) args.push("--filter=blob:none");
  await clone(args, opts);
}

/**
 * Clones the whole history into `destination` and checks out `ref` when given. Commit SHAs
 * need this: a shallow clone can only name a branch or tag.
 */
export async function cloneFull(opts: CloneOptions): Promise<void> {
  const args = ["clone"];
  if (opts.blobless === true) args.push("--filter=blob:none");
  const gitOptions = await clone(args, opts);
  // A blobless checkout may fetch missing objects. Keep the same ephemeral auth
  // for both checkout attempts, including the lazy-fetch subprocesses they spawn.
  if (opts.ref !== undefined) await fetchRef(opts.destination, opts.ref, gitOptions);
}

async function clone(args: string[], opts: CloneOptions): Promise<RunGitOptions> {
  // Callers reject credential-bearing URLs (@caplet/core credentials); auth arrives only as a header.
  const gitOptions: RunGitOptions =
    opts.authHeader === undefined
      ? {}
      : {
          env: gitConfigEnv(`http.${opts.url}.extraHeader`, opts.authHeader),
          secrets: authSecrets(opts.authHeader),
        };
  args.push(opts.url, opts.destination);
  await runGit(args, undefined, gitOptions);
  return gitOptions;
}

/**
 * Checks out `ref` detached in `repoDir`, falling back to `origin/<ref>` for a branch name.
 * It runs no `git fetch`; a blobless clone fetches the objects it lacks during checkout.
 */
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

/** The commit `HEAD` points to in `repoDir`. */
export async function revParseHead(repoDir: string): Promise<string> {
  const { stdout } = await runGit(["rev-parse", "HEAD"], repoDir);
  return stdout.trim();
}

/** Whether `ref` is a full 40-character hexadecimal commit SHA. */
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

// Matches the userinfo part of http(s) URLs, e.g. `https://user:secret@`. Source URLs never carry
// one, but git may echo a redirect or configured remote that does.
const HTTP_USERINFO = /\b(https?:[/][/])[^\s/@'"]+@/gi;

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
