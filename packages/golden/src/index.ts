/**
 * Golden-tree harness shared by the workspace test suites.
 *
 * A golden case lives at `tests/golden/<case>/` with an `input/` tree the test feeds to the
 * code under test and an `expected/` tree the output must equal. Trees compare by relative
 * path, exact bytes and the executable bit; everything else (timestamps, other mode bits,
 * empty directories) is ignored because git does not preserve it either.
 *
 * Set `UPDATE_GOLDEN=1` to rewrite `expected/` from the actual output instead of failing.
 */
import type { Dirent } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** One file of a golden tree. */
export type GoldenFile = { bytes: Uint8Array; executable: boolean };

/** A file tree keyed by POSIX relative path (`a/b.txt`, never `./a` or `a\\b`). */
export type GoldenTree = Map<string, GoldenFile>;

/** Shorthand file content for {@link treeFromFiles}: text, raw bytes, or either with a mode. */
export type GoldenFileInput =
  | string
  | Uint8Array
  | { content: string | Uint8Array; executable?: boolean };

/** Structural subset of `@caplet/core`'s `FileDiff`, so the harness needs no core import. */
export type GoldenFileDiff = {
  path: string;
  after: string | Uint8Array | null;
  afterMode?: number | null | undefined;
};

/** Paths of one golden case. */
export type GoldenCase = { name: string; root: string; input: string; expected: string };

/** Options for {@link assertGoldenTree}. */
export type GoldenAssertOptions = {
  /** Rewrite `expected/` instead of comparing. Defaults to `process.env.UPDATE_GOLDEN === "1"`. */
  update?: boolean;
};

const encoder = new TextEncoder();

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? encoder.encode(content) : content;
}

function isExecutableMode(mode: number | null | undefined): boolean {
  return mode !== null && mode !== undefined && (mode & 0o111) !== 0;
}

/**
 * Resolves the conventional paths of `<testsDir>/golden/<name>/`. Pass the directory of the
 * test file (`import.meta.dir`) so cases sit next to the tests that use them.
 */
export function goldenCase(testsDir: string, name: string): GoldenCase {
  const root = path.join(testsDir, "golden", name);
  return { name, root, input: path.join(root, "input"), expected: path.join(root, "expected") };
}

/** Builds an in-memory tree; files are non-executable unless they say otherwise. */
export function treeFromFiles(files: Readonly<Record<string, GoldenFileInput>>): GoldenTree {
  const tree: GoldenTree = new Map();
  for (const [relative, input] of Object.entries(files)) {
    const file =
      typeof input === "string" || input instanceof Uint8Array
        ? { bytes: toBytes(input), executable: false }
        : { bytes: toBytes(input.content), executable: input.executable === true };
    tree.set(normalizeRelative(relative), file);
  }
  return tree;
}

/**
 * Builds the tree an emitter would leave on disk: every diff with non-null `after` becomes a
 * file at its path relative to `root`; deletions (`after: null`) are skipped. Throws when a
 * diff path lies outside `root`, because such a file cannot be part of the golden.
 */
export function treeFromFileDiffs(diffs: readonly GoldenFileDiff[], root: string): GoldenTree {
  const tree: GoldenTree = new Map();
  for (const diff of diffs) {
    if (diff.after === null) continue;
    const relative = path.relative(root, diff.path);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`${diff.path} is outside the golden root ${root}`);
    }
    tree.set(normalizeRelative(relative), {
      bytes: toBytes(diff.after),
      executable: isExecutableMode(diff.afterMode),
    });
  }
  return tree;
}

/** Reads every regular file under `dir`. A missing directory reads as an empty tree. */
export async function readTree(dir: string): Promise<GoldenTree> {
  const tree: GoldenTree = new Map();
  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (current === dir && isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const [bytes, info] = await Promise.all([readFile(absolute), stat(absolute)]);
        tree.set(normalizeRelative(path.relative(dir, absolute)), {
          bytes: new Uint8Array(bytes),
          executable: isExecutableMode(info.mode),
        });
      }
    }
  }
  await walk(dir);
  return tree;
}

/** Replaces `dir` with exactly the files of `tree`, applying 0755 or 0644 modes. */
export async function writeTree(tree: GoldenTree, dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [relative, file] of tree) {
    const absolute = path.join(dir, ...relative.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.bytes);
    await chmod(absolute, file.executable ? 0o755 : 0o644);
  }
}

/**
 * Compares two trees and returns one readable line block per differing path, sorted by path.
 * An empty result means the trees are equal.
 */
function diffTrees(actual: GoldenTree, expected: GoldenTree): string[] {
  const paths = [...new Set([...actual.keys(), ...expected.keys()])].sort();
  const blocks: string[] = [];
  for (const relative of paths) {
    const got = actual.get(relative);
    const want = expected.get(relative);
    if (got === undefined) {
      blocks.push(`- ${relative}: missing from actual tree`);
      continue;
    }
    if (want === undefined) {
      blocks.push(`+ ${relative}: not in expected tree`);
      continue;
    }
    if (!bytesEqual(got.bytes, want.bytes)) blocks.push(describeContentChange(relative, want, got));
    if (got.executable !== want.executable) {
      blocks.push(
        `~ ${relative}: mode differs (expected ${modeWord(want)}, actual ${modeWord(got)})`,
      );
    }
  }
  return blocks;
}

/**
 * Asserts `actual` equals the tree stored at `expectedDir`, throwing an Error whose message
 * lists every differing path with a line diff. In update mode it rewrites `expectedDir` from
 * `actual` and returns without comparing.
 */
export async function assertGoldenTree(
  actual: GoldenTree,
  expectedDir: string,
  options: GoldenAssertOptions = {},
): Promise<void> {
  const update = options.update ?? process.env.UPDATE_GOLDEN === "1";
  if (update) {
    await writeTree(actual, expectedDir);
    return;
  }
  const differences = diffTrees(actual, await readTree(expectedDir));
  if (differences.length === 0) return;
  throw new Error(
    [
      `Golden tree mismatch against ${expectedDir}:`,
      ...differences,
      "Run the test with UPDATE_GOLDEN=1 to accept the actual tree.",
    ].join("\n"),
  );
}

function normalizeRelative(relative: string): string {
  return relative.split(path.sep).join("/").replace(/^\.\//, "");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function modeWord(file: GoldenFile): string {
  return file.executable ? "executable" : "not executable";
}

const decoder = new TextDecoder("utf-8", { fatal: true });

function asText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

function describeContentChange(relative: string, want: GoldenFile, got: GoldenFile): string {
  const wantText = asText(want.bytes);
  const gotText = asText(got.bytes);
  if (wantText === undefined || gotText === undefined) {
    return `~ ${relative}: binary content differs (${want.bytes.length} bytes expected, ${got.bytes.length} bytes actual)`;
  }
  return [`~ ${relative}: content differs`, ...lineDiff(wantText, gotText)].join("\n");
}

/** Lines of context kept around each change in a content diff. */
const CONTEXT = 2;
/** Above this many cells the LCS table is skipped and the whole files are shown as replaced. */
const MAX_LCS_CELLS = 4_000_000;

/** Line diff of expected (`-`) versus actual (`+`) with unchanged context lines (`  `). */
function lineDiff(expected: string, actual: string): string[] {
  const before = expected.split("\n");
  const after = actual.split("\n");
  const ops = diffOps(before, after);
  const keep = new Set<number>();
  ops.forEach((op, index) => {
    if (op.kind === "same") return;
    for (let near = index - CONTEXT; near <= index + CONTEXT; near += 1) keep.add(near);
  });
  const lines: string[] = [];
  let skipped = false;
  ops.forEach((op, index) => {
    if (!keep.has(index)) {
      skipped = true;
      return;
    }
    if (skipped && lines.length > 0) lines.push("    ...");
    skipped = false;
    const marker = op.kind === "same" ? " " : op.kind === "removed" ? "-" : "+";
    lines.push(`  ${marker} ${visible(op.line)}`);
  });
  return lines;
}

/** Makes trailing whitespace and an absent final newline visible in diff output. */
function visible(line: string): string {
  return line.replace(/[ \t]+$/, (tail) => tail.replace(/ /g, "\u00b7").replace(/\t/g, "\u2192"));
}

type DiffOp = { kind: "same" | "removed" | "added"; line: string };

function diffOps(before: readonly string[], after: readonly string[]): DiffOp[] {
  if (before.length * after.length > MAX_LCS_CELLS) {
    return [
      ...before.map((line): DiffOp => ({ kind: "removed", line })),
      ...after.map((line): DiffOp => ({ kind: "added", line })),
    ];
  }
  const width = after.length + 1;
  const lcs = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        before[i] === after[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const left = before[i] ?? "";
    const right = after[j] ?? "";
    if (left === right) {
      ops.push({ kind: "same", line: left });
      i += 1;
      j += 1;
    } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
      ops.push({ kind: "removed", line: left });
      i += 1;
    } else {
      ops.push({ kind: "added", line: right });
      j += 1;
    }
  }
  for (; i < before.length; i += 1) ops.push({ kind: "removed", line: before[i] ?? "" });
  for (; j < after.length; j += 1) ops.push({ kind: "added", line: after[j] ?? "" });
  return ops;
}
