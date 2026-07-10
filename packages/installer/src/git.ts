import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type CloneOptions = {
  url: string;
  destination: string;
  ref?: string | undefined;
  blobless?: boolean | undefined;
};

type ShallowCloneOptions = CloneOptions & { ref: string };

export async function cloneShallow(opts: ShallowCloneOptions): Promise<void> {
  const args = ["clone", "--depth", "1", "--branch", opts.ref];
  if (opts.blobless === true) args.push("--filter=blob:none");
  args.push(opts.url, opts.destination);
  await runGit(args);
}

export async function cloneFull(opts: CloneOptions): Promise<void> {
  const args = ["clone"];
  if (opts.blobless === true) args.push("--filter=blob:none");
  args.push(opts.url, opts.destination);
  await runGit(args);
  if (opts.ref !== undefined) await fetchRef(opts.destination, opts.ref);
}

export async function fetchRef(repoDir: string, ref: string): Promise<void> {
  try {
    await runGit(["checkout", "--detach", ref], repoDir);
  } catch (error) {
    if (looksLikeSha(ref)) throw error;
    await runGit(["checkout", "--detach", `origin/${ref}`], repoDir);
  }
}

export async function revParseHead(repoDir: string): Promise<string> {
  const { stdout } = await runGit(["rev-parse", "HEAD"], repoDir);
  return stdout.trim();
}

export function looksLikeSha(ref: string | undefined): boolean {
  return ref !== undefined && /^[a-f0-9]{40}$/i.test(ref);
}

async function runGit(args: string[], cwd?: string | undefined): Promise<{ stdout: string }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT ?? "0" },
    });
    return { stdout: String(result.stdout) };
  } catch (error) {
    throw new Error(`git ${args.join(" ")} failed: ${gitErrorMessage(error)}`);
  }
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
