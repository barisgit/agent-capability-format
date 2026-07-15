import { expect, test } from "bun:test";
import path from "node:path";
import {
  deduplicateCapabilities,
  discoverCapabilityRoots,
  readRepositoryCapabilities,
  resolveScopeCapabilities,
  scopeRoot,
} from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

test("resolver discovers single-root acf.yml", async () => {
  const dir = await tempDir("acf-resolver-single-");
  try {
    await writeText(path.join(dir, "acf.yml"), "acf: 1\nname: single\nversion: 1.0.0\n");
    expect(await discoverCapabilityRoots(dir)).toEqual([dir]);
  } finally {
    await cleanup(dir);
  }
});

test("resolver discovers multi acf directory at arbitrary depth", async () => {
  const dir = await tempDir("acf-resolver-multi-");
  try {
    await writeText(path.join(dir, "acf", "one", "acf.yml"), "acf: 1\nname: one\nversion: 1.0.0\n");
    await writeText(
      path.join(dir, "acf", "nested", "two", "acf.yml"),
      "acf: 1\nname: two\nversion: 1.0.0\n",
    );
    expect((await discoverCapabilityRoots(dir)).map((p) => path.basename(p)).sort()).toEqual([
      "one",
      "two",
    ]);
  } finally {
    await cleanup(dir);
  }
});

test("core repository reading does not mutate bare skill sources", async () => {
  const dir = await tempDir("acf-resolver-bare-");
  try {
    await writeText(
      path.join(dir, "skills", "legacy", "SKILL.md"),
      "---\nname: legacy\ndescription: Legacy\n---\nbody\n",
    );
    const result = await readRepositoryCapabilities(dir);
    expect(result.capabilities).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "acf.resolve.no-capabilities",
    );
    expect(await Bun.file(path.join(dir, "acf.yml")).exists()).toBe(false);
  } finally {
    await cleanup(dir);
  }
});

test("project shadows user and same-scope collision is diagnosed", async () => {
  const userDir = await tempDir("acf-user-");
  const projectDir = await tempDir("acf-project-");
  try {
    await writeText(
      path.join(userDir, "capabilities", "a", "acf.yml"),
      "acf: 1\nname: same\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(userDir, "capabilities", "b", "acf.yml"),
      "acf: 1\nname: same\nversion: 1.0.0\n",
    );
    await writeText(
      path.join(projectDir, "capabilities", "same", "acf.yml"),
      "acf: 1\nname: same\nversion: 1.0.0\n",
    );
    const user = await resolveScopeCapabilities(scopeRoot("user", userDir));
    const project = await resolveScopeCapabilities(scopeRoot("project", projectDir));
    expect(user.diagnostics.map((d) => d.code)).toContain("acf.capability.name-collision");
    expect(
      deduplicateCapabilities(user.capabilities, project.capabilities).diagnostics.map(
        (d) => d.code,
      ),
    ).toContain("acf.capability.shadowed");
  } finally {
    await cleanup(userDir);
    await cleanup(projectDir);
  }
});
