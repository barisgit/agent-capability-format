import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmod, readFile } from "node:fs/promises";
import path from "node:path";
import { fetchCapability } from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

// A fake `git` on PATH records argv plus GIT_CONFIG_* env and simulates clone
// success or failure. Failure output echoes the URL and any injected config
// values, like a verbose git would, so redaction is tested against the worst case.
const FAKE_GIT = `#!/bin/sh
{ printf 'ARGS:'; for a in "$@"; do printf ' %s' "$a"; done; echo; env | grep '^GIT_CONFIG_' | sort; } >> "$FAKE_GIT_LOG"
case "$1" in
  clone)
    url=""; dest=""
    for a in "$@"; do url="$dest"; dest="$a"; done
    if [ "$FAKE_GIT_FAIL" = 1 ]; then
      echo "fatal: unable to access '$url': auth failed $(env | grep '^GIT_CONFIG_VALUE_') $FAKE_GIT_ERROR" >&2
      exit 128
    fi
    mkdir -p "$dest"
    ;;
  checkout)
    if [ -n "$FAKE_GIT_EXPECT_AUTH" ] && ! env | grep '^GIT_CONFIG_VALUE_' | grep -Fq "$FAKE_GIT_EXPECT_AUTH"; then
      echo 'fatal: lazy fetch requires authentication' >&2
      exit 128
    fi
    if [ "$FAKE_GIT_CHECKOUT_FAIL" = 1 ]; then
      echo "fatal: checkout failed $FAKE_GIT_ERROR" >&2
      exit 128
    fi
    if [ "$FAKE_GIT_FALLBACK" = 1 ] && [ "$3" = topic ]; then exit 1; fi
    ;;
  rev-parse) echo ${"a".repeat(40)} ;;
esac
exit 0
`;

const TOKEN = "ghp_fakeTOKEN123";
const TOKEN_B64 = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");

let dir: string;
let log: string;
const saved = {
  PATH: process.env.PATH,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  FAKE_GIT_LOG: process.env.FAKE_GIT_LOG,
  FAKE_GIT_FAIL: process.env.FAKE_GIT_FAIL,
  GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT,
  FAKE_GIT_ERROR: process.env.FAKE_GIT_ERROR,
  FAKE_GIT_EXPECT_AUTH: process.env.FAKE_GIT_EXPECT_AUTH,
  FAKE_GIT_CHECKOUT_FAIL: process.env.FAKE_GIT_CHECKOUT_FAIL,
  FAKE_GIT_FALLBACK: process.env.FAKE_GIT_FALLBACK,
};

beforeEach(async () => {
  dir = await tempDir("acf-installer-git-auth-");
  const bin = path.join(dir, "bin");
  await writeText(path.join(bin, "git"), FAKE_GIT);
  await chmod(path.join(bin, "git"), 0o755);
  log = path.join(dir, "git.log");
  await writeText(log, "");
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH ?? ""}`;
  process.env.FAKE_GIT_LOG = log;
  delete process.env.FAKE_GIT_FAIL;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GIT_CONFIG_COUNT;
  delete process.env.FAKE_GIT_ERROR;
  delete process.env.FAKE_GIT_EXPECT_AUTH;
  delete process.env.FAKE_GIT_CHECKOUT_FAIL;
  delete process.env.FAKE_GIT_FALLBACK;
});

afterEach(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await cleanup(dir);
});

function fetchGithub() {
  return fetchCapability(
    { source: { kind: "github", repo: "owner/repo" }, ref: "main" },
    { cacheDir: path.join(dir, "cache") },
  );
}

function fetchGit(url: string) {
  return fetchCapability(
    { source: { kind: "git", url }, ref: "main" },
    { cacheDir: path.join(dir, "cache") },
  );
}

async function caughtMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected rejection");
}

test("GITHUB_TOKEN authenticates via env-scoped header, not the clone URL or argv", async () => {
  process.env.GITHUB_TOKEN = TOKEN;

  const fetched = await fetchGithub();
  expect(fetched.commit).toBe("a".repeat(40));

  const calls = await readFile(log, "utf8");
  const argLines = calls.split("\n").filter((line) => line.startsWith("ARGS:"));
  expect(argLines.join("\n")).not.toContain(TOKEN);
  expect(argLines[0]).toContain(" https://github.com/owner/repo.git ");
  expect(calls).toContain("GIT_CONFIG_KEY_0=http.https://github.com/owner/repo.git.extraHeader");
  expect(calls).toContain(`GIT_CONFIG_VALUE_0=Authorization: Basic ${TOKEN_B64}`);
});

test("failed authenticated clone does not leak the token in the error", async () => {
  process.env.GITHUB_TOKEN = TOKEN;
  process.env.FAKE_GIT_FAIL = "1";

  const message = await caughtMessage(fetchGithub());
  expect(message).toContain("git clone");
  expect(message).not.toContain(TOKEN);
  expect(message).not.toContain(encodeURIComponent(TOKEN));
  expect(message).not.toContain(TOKEN_B64);
});

test("explicit https userinfo is redacted in errors and stripped from the cached remote", async () => {
  process.env.FAKE_GIT_FAIL = "1";
  const message = await caughtMessage(fetchGit("https://alice:s3cret@example.com/repo.git"));
  expect(message).not.toContain("s3cret");
  expect(message).not.toContain("alice:");
  expect(message).toContain("example.com/repo.git");

  delete process.env.FAKE_GIT_FAIL;
  await writeText(log, "");
  await fetchGit("https://alice:s3cret@example.com/repo.git");
  const calls = await readFile(log, "utf8");
  expect(calls).toContain(" https://example.com/repo.git ");
  expect(calls).not.toContain("alice:s3cret");
});

test("no token and SSH sources pass URLs through unchanged without auth config", async () => {
  await fetchGithub();
  await fetchGit("git@github.com:owner/repo.git");
  await fetchGit("ssh://git@example.com/repo.git");

  const calls = await readFile(log, "utf8");
  expect(calls).not.toContain("GIT_CONFIG_");
  expect(calls).not.toContain("remote set-url");
  expect(calls).toContain(" https://github.com/owner/repo.git ");
  expect(calls).toContain(" git@github.com:owner/repo.git ");
  expect(calls).toContain(" ssh://git@example.com/repo.git ");
});

for (const ref of ["b".repeat(40), "topic"]) {
  test(`authenticated blobless checkout retains credentials for ${ref}`, async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    process.env.FAKE_GIT_EXPECT_AUTH = `Authorization: Basic ${TOKEN_B64}`;
    process.env.FAKE_GIT_FALLBACK = "1";
    const fetched = await fetchCapability(
      { source: { kind: "github", repo: "owner/repo" }, ref },
      { cacheDir: path.join(dir, "cache"), shallow: ref === "topic" ? false : undefined },
    );
    expect(fetched.commit).toBe("a".repeat(40));
    const calls = await readFile(log, "utf8");
    expect(calls).toContain(`ARGS: checkout --detach ${ref}`);
    if (ref === "topic") expect(calls).toContain("ARGS: checkout --detach origin/topic");
    expect(calls).toContain("--filter=blob:none");
  });
}

test("explicit HTTPS credentials survive authenticated blobless checkout without URL userinfo", async () => {
  process.env.FAKE_GIT_EXPECT_AUTH = `Authorization: Basic ${Buffer.from("alice:s3cret").toString("base64")}`;
  await fetchCapability(
    {
      source: { kind: "git", url: "https://alice:s3cret@example.com/repo.git" },
      ref: "b".repeat(40),
    },
    { cacheDir: path.join(dir, "cache") },
  );
  const calls = await readFile(log, "utf8");
  const args = calls.split("\n").filter((line) => line.startsWith("ARGS:"));
  expect(args.join("\n")).not.toContain("alice:s3cret");
});

for (const operation of ["clone", "checkout"] as const) {
  for (const encoding of ["raw", "percent"] as const) {
    test(`${operation} errors redact ${encoding} token text outside URLs`, async () => {
      const secret = "fake-token:with/slash+percent%";
      process.env.GITHUB_TOKEN = secret;
      process.env.FAKE_GIT_ERROR = encoding === "raw" ? secret : encodeURIComponent(secret);
      process.env[operation === "clone" ? "FAKE_GIT_FAIL" : "FAKE_GIT_CHECKOUT_FAIL"] = "1";
      const message = await caughtMessage(
        fetchCapability(
          { source: { kind: "github", repo: "owner/repo" }, ref: "b".repeat(40) },
          { cacheDir: path.join(dir, "cache") },
        ),
      );
      expect(message).toContain("git");
      expect(message).not.toContain(secret);
      expect(message).not.toContain(encodeURIComponent(secret));
    });
  }
}
