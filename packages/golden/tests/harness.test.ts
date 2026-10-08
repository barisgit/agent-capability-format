import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertGoldenTree,
  type GoldenTree,
  goldenCase,
  readTree,
  treeFromFileDiffs,
  treeFromFiles,
  writeTree,
} from "../src/index";

const sample = goldenCase(import.meta.dir, "sample");

const SKILL = "---\nname: review\ndescription: Review a change.\n---\n\nRead the diff.\n";

function sampleTree(): GoldenTree {
  return treeFromFiles({
    "plugin.json": '{\n  "name": "sample"\n}\n',
    "skills/review/SKILL.md": SKILL,
    "skills/review/scripts/run.sh": { content: "#!/bin/sh\necho review\n", executable: true },
  });
}

const temps: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "acf-golden-"));
  temps.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function failure(actual: GoldenTree): Promise<string> {
  try {
    await assertGoldenTree(actual, sample.expected, { update: false });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the golden comparison to fail");
}

test("goldenCase resolves the input and expected directories of a case", () => {
  expect(sample.input).toBe(path.join(import.meta.dir, "golden", "sample", "input"));
  expect(sample.expected).toBe(path.join(import.meta.dir, "golden", "sample", "expected"));
});

test("an identical in-memory tree matches the committed golden", async () => {
  await assertGoldenTree(sampleTree(), sample.expected, { update: false });
});

test("an identical on-disk tree matches the committed golden", async () => {
  const dir = await tempDir();
  await writeTree(sampleTree(), dir);
  await assertGoldenTree(await readTree(dir), sample.expected, { update: false });
});

test("a changed byte fails with a line diff naming the file", async () => {
  const tree = sampleTree();
  tree.set("skills/review/SKILL.md", {
    bytes: new TextEncoder().encode(SKILL.replace("Read the diff.", "Read the patch.")),
    executable: false,
  });
  const message = await failure(tree);
  expect(message).toContain("~ skills/review/SKILL.md: content differs");
  expect(message).toContain("- Read the diff.");
  expect(message).toContain("+ Read the patch.");
  expect(message).toContain("UPDATE_GOLDEN=1");
});

test("a missing or extra path fails and names the path", async () => {
  const tree = sampleTree();
  tree.delete("plugin.json");
  tree.set("extra.txt", { bytes: new TextEncoder().encode("x\n"), executable: false });
  const message = await failure(tree);
  expect(message).toContain("- plugin.json: missing from actual tree");
  expect(message).toContain("+ extra.txt: not in expected tree");
});

test("a lost executable bit fails as a mode change", async () => {
  const tree = sampleTree();
  const script = tree.get("skills/review/scripts/run.sh");
  if (script === undefined) throw new Error("sample tree lacks the script");
  tree.set("skills/review/scripts/run.sh", { ...script, executable: false });
  const message = await failure(tree);
  expect(message).toContain(
    "~ skills/review/scripts/run.sh: mode differs (expected executable, actual not executable)",
  );
});

test("binary content differences are summarised instead of printed", async () => {
  const tree = sampleTree();
  tree.set("plugin.json", { bytes: new Uint8Array([0, 1, 2]), executable: false });
  const message = await failure(tree);
  expect(message).toContain(
    "~ plugin.json: binary content differs (23 bytes expected, 3 bytes actual)",
  );
});

test("update mode rewrites the expected directory to match the actual tree", async () => {
  const expected = await tempDir();
  await writeTree(treeFromFiles({ "stale.txt": "old\n", "plugin.json": "{}\n" }), expected);
  await assertGoldenTree(sampleTree(), expected, { update: true });
  const written = await readTree(expected);
  expect([...written.keys()].sort()).toEqual([
    "plugin.json",
    "skills/review/SKILL.md",
    "skills/review/scripts/run.sh",
  ]);
  expect((await stat(path.join(expected, "skills/review/scripts/run.sh"))).mode & 0o111).not.toBe(
    0,
  );
  expect(await readFile(path.join(expected, "plugin.json"), "utf8")).toBe(
    '{\n  "name": "sample"\n}\n',
  );
});

test("update mode follows UPDATE_GOLDEN=1 by default", async () => {
  const expected = await tempDir();
  const previous = process.env.UPDATE_GOLDEN;
  process.env.UPDATE_GOLDEN = "1";
  try {
    await assertGoldenTree(sampleTree(), expected);
  } finally {
    if (previous === undefined) delete process.env.UPDATE_GOLDEN;
    else process.env.UPDATE_GOLDEN = previous;
  }
  await assertGoldenTree(sampleTree(), expected, { update: false });
});

test("emitted file diffs become a tree relative to the emit root", async () => {
  const root = "/work/project";
  const tree = treeFromFileDiffs(
    [
      { path: `${root}/plugin.json`, after: '{\n  "name": "sample"\n}\n' },
      { path: `${root}/skills/review/SKILL.md`, after: SKILL },
      {
        path: `${root}/skills/review/scripts/run.sh`,
        after: new TextEncoder().encode("#!/bin/sh\necho review\n"),
        afterMode: 0o755,
      },
      { path: `${root}/removed.txt`, after: null },
    ],
    root,
  );
  await assertGoldenTree(tree, sample.expected, { update: false });
});

test("file diffs outside the emit root are rejected", () => {
  expect(() => treeFromFileDiffs([{ path: "/elsewhere/x", after: "x" }], "/work")).toThrow(
    "outside the golden root",
  );
});
