import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, readFile, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import { type AcfCapability, readCapability, resolveScopeCapabilities } from "@caplet/core";
import { resolveCapabilities } from "../src";
import { cleanup, tempDir, testScopeRoot, writeText } from "./helpers";

// Fixtures are built per test: symlinks, FIFOs and colliding names cannot live in git.

async function resolvePathSource(dir: string, repo: string) {
  const scopeRoot = testScopeRoot("project", path.join(dir, ".agents"));
  await writeText(scopeRoot.manifestPath, `acf: 1\ncapabilities:\n  - source: path:${repo}\n`);
  const result = await resolveCapabilities({ scope: "project", scopeRoot, mode: "auto" });
  return { scopeRoot, result };
}

function errors(result: Awaited<ReturnType<typeof resolveCapabilities>>) {
  return result.diagnostics.filter((item) => item.severity === "error");
}

test("a snapshot keeps hidden files, exact bytes and executable bits but not .git", async () => {
  const dir = await tempDir("acf-snapshot-complete-");
  try {
    const repo = path.join(dir, "repo");
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: complete\nversion: 1.0.0\n");
    await writeText(path.join(repo, ".claude-plugin", "plugin.json"), '{ "name":  "x" }\r\n');
    await writeText(path.join(repo, ".env.example"), "KEY=\n");
    await writeText(path.join(repo, "scripts", "run.sh"), "#!/bin/sh\necho hi\n");
    await chmod(path.join(repo, "scripts", "run.sh"), 0o755);
    await writeText(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");

    const { scopeRoot, result } = await resolvePathSource(dir, repo);

    expect(errors(result)).toEqual([]);
    const snapshot = path.join(scopeRoot.capabilitiesDir, "complete");
    expect(await readFile(path.join(snapshot, ".claude-plugin", "plugin.json"), "utf8")).toBe(
      '{ "name":  "x" }\r\n',
    );
    expect(await Bun.file(path.join(snapshot, ".env.example")).exists()).toBe(true);
    expect((await stat(path.join(snapshot, "scripts", "run.sh"))).mode & 0o111).toBe(0o111);
    expect((await stat(path.join(snapshot, "acf.yml"))).mode & 0o111).toBe(0);
    expect(await Bun.file(path.join(snapshot, ".git", "HEAD")).exists()).toBe(false);
  } finally {
    await cleanup(dir);
  }
});

test("a symbolic link in a package fails resolution naming the link", async () => {
  const dir = await tempDir("acf-snapshot-symlink-");
  try {
    const repo = path.join(dir, "repo");
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: linked\nversion: 1.0.0\n");
    await writeText(path.join(repo, "docs", "real.md"), "real\n");
    await symlink("real.md", path.join(repo, "docs", "alias.md"));

    const { scopeRoot, result } = await resolvePathSource(dir, repo);

    expect(errors(result).map((item) => [item.code, item.data?.path])).toEqual([
      ["acf.source.snapshot-rejected", "docs/alias.md"],
    ]);
    expect(errors(result)[0]?.message).toContain("docs/alias.md");
    expect(await Bun.file(scopeRoot.lockPath).exists()).toBe(false);
    expect(await Bun.file(path.join(scopeRoot.capabilitiesDir, "linked", "acf.yml")).exists()).toBe(
      false,
    );
  } finally {
    await cleanup(dir);
  }
});

test("a special file in a package fails resolution naming it", async () => {
  const dir = await tempDir("acf-snapshot-fifo-");
  try {
    const repo = path.join(dir, "repo");
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: special\nversion: 1.0.0\n");
    execFileSync("mkfifo", [path.join(repo, "pipe")]);

    const { result } = await resolvePathSource(dir, repo);

    expect(errors(result).map((item) => [item.code, item.data?.path])).toEqual([
      ["acf.source.snapshot-rejected", "pipe"],
    ]);
  } finally {
    await cleanup(dir);
  }
});

test("paths colliding after NFC or case normalization fail resolution naming them", async () => {
  for (const [first, second] of [
    ["\u00e9.md", "e\u0301.md"],
    ["README.md", "readme.md"],
  ] as const) {
    const dir = await tempDir("acf-snapshot-collision-");
    try {
      const repo = path.join(dir, "repo");
      await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: collide\nversion: 1.0.0\n");
      await writeText(path.join(repo, "docs", first), "one\n");
      await writeText(path.join(repo, "docs", second), "two\n");

      const { result } = await resolvePathSource(dir, repo);

      const rejected = errors(result);
      expect(rejected.map((item) => item.code)).toEqual(["acf.source.snapshot-rejected"]);
      expect([`docs/${first}`, `docs/${second}`]).toContain(String(rejected[0]?.data?.path));
    } finally {
      await cleanup(dir);
    }
  }
});

test("a bare skill snapshot is complete and rejects links like any package", async () => {
  const dir = await tempDir("acf-snapshot-skill-");
  try {
    const repo = path.join(dir, "repo");
    await writeText(path.join(repo, "SKILL.md"), "---\nname: tool\ndescription: Tool\n---\n");
    await writeText(path.join(repo, ".config", "settings.json"), "{}\n");
    await writeText(path.join(repo, "bin", "tool"), "#!/bin/sh\n");
    await chmod(path.join(repo, "bin", "tool"), 0o755);

    const { scopeRoot, result } = await resolvePathSource(dir, repo);

    expect(errors(result)).toEqual([]);
    const skill = path.join(scopeRoot.capabilitiesDir, "tool", "skills", "tool");
    expect(await Bun.file(path.join(skill, ".config", "settings.json")).exists()).toBe(true);
    expect((await stat(path.join(skill, "bin", "tool"))).mode & 0o111).toBe(0o111);
    const reread = await resolveScopeCapabilities(scopeRoot);
    expect(reread.capabilities[0]?.source).toEqual({
      format: "skills",
      path: ".",
      snapshotRoot: skill,
    });

    await symlink("SKILL.md", path.join(repo, "alias.md"));
    const forced = await resolveCapabilities({ scope: "project", scopeRoot, mode: "force" });
    expect(errors(forced).map((item) => item.data?.path)).toEqual(["alias.md"]);
  } finally {
    await cleanup(dir);
  }
});

test("an installed capability re-reads offline with the same projection and its source", async () => {
  const dir = await tempDir("acf-snapshot-offline-");
  try {
    const repo = path.join(dir, "repo");
    await writeText(path.join(repo, "acf.yml"), "acf: 1\nname: offline\nversion: 1.0.0\n");
    await writeText(
      path.join(repo, "skills", "use", "SKILL.md"),
      "---\nname: use\ndescription: Use it\n---\nBody.\n",
    );
    await writeText(
      path.join(repo, "mcp.json"),
      '{ "servers": { "srv": { "transport": "stdio", "command": "node" } } }\n',
    );
    const expected = projection(
      await readCapability(repo, "project", { kind: "local", directory: repo }),
      repo,
    );
    const { scopeRoot, result } = await resolvePathSource(dir, repo);
    expect(errors(result)).toEqual([]);
    await rm(repo, { recursive: true, force: true });

    const reread = await resolveScopeCapabilities(scopeRoot);
    const snapshot = path.join(scopeRoot.capabilitiesDir, "offline");
    expect(reread.diagnostics).toEqual([]);
    expect(reread.capabilities.map((capability) => projection(capability, snapshot))).toEqual([
      expected,
    ]);
    expect(reread.capabilities[0]?.source).toEqual({
      format: "acf",
      path: ".",
      snapshotRoot: snapshot,
    });
  } finally {
    await cleanup(dir);
  }
});

/** The capability as readers project it, independent of where its tree lives. */
function projection(capability: AcfCapability, root: string): unknown {
  const { origin: _origin, source: _source, ...rest } = capability;
  return JSON.parse(JSON.stringify(rest).replaceAll(root, "<ROOT>"));
}
