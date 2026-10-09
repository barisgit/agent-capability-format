import { expect, test } from "bun:test";
import path from "node:path";
import {
  type CapabilitiesLock,
  computeCapabilityDigests,
  deduplicateCapabilities,
  discoverRepository,
  readRepositoryCapabilities,
  resolveScopeCapabilities,
  scopeRoot,
} from "../src";
import { cleanup, tempDir, writeText } from "./helpers";

test("resolver discovers single-root acf.yml", async () => {
  const dir = await tempDir("acf-resolver-single-");
  try {
    await writeText(path.join(dir, "acf.yml"), "acf: 1\nname: single\nversion: 1.0.0\n");
    expect((await discoverRepository(dir)).roots).toEqual([dir]);
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
    expect((await discoverRepository(dir)).roots.map((p) => path.basename(p)).sort()).toEqual([
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

test("foreign snapshots are read with the reader their lock record names", async () => {
  const dir = await tempDir("acf-resolver-foreign-");
  try {
    const scope = scopeRoot("project", dir);
    const snapshot = path.join(scope.capabilitiesDir, "review-kit");
    await writeText(
      path.join(snapshot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "review-kit", version: "v3" }),
    );
    await writeText(
      path.join(snapshot, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n",
    );
    const { capabilityHash, payloadDigest } = await computeCapabilityDigests(snapshot);
    const lock: CapabilitiesLock = {
      acf: 1,
      entries: [
        {
          capabilityHash,
          capabilityNames: ["review-kit"],
          source: "path:../plugin",
          sourceId: "path:/plugin",
          resolvedSha: "abc123",
          resolvedCapabilities: [
            {
              name: "review-kit",
              format: "claude-plugin",
              path: "plugins/review",
              payloadDigest,
              capabilityHash,
            },
          ],
        },
      ],
    };

    const { capabilities, diagnostics } = await resolveScopeCapabilities(scope, { lock });
    expect(diagnostics).toEqual([]);
    expect(capabilities.map((cap) => [cap.manifest.name, cap.manifest.version])).toEqual([
      ["review-kit", "0.0.0-unversioned+abc123"],
    ]);
    expect(capabilities[0]?.skills.map((skill) => skill.name)).toEqual(["review"]);
    expect(capabilities[0]?.source).toEqual({
      format: "claude-plugin",
      path: "plugins/review",
      snapshotRoot: snapshot,
      projected: {
        skills: ["review"],
        skillDirs: ["skills/review"],
        servers: [],
        remainder: [],
      },
    });
  } finally {
    await cleanup(dir);
  }
});

test("installed capabilities carry the selection their lock entry mirrors", async () => {
  const dir = await tempDir("acf-resolver-selection-");
  try {
    const scope = scopeRoot("project", dir);
    const snapshot = path.join(scope.capabilitiesDir, "review-kit");
    await writeText(
      path.join(snapshot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "review-kit", version: "1.0.0" }),
    );
    for (const name of ["review", "draft"])
      await writeText(
        path.join(snapshot, "skills", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name}\n---\n`,
      );
    const { capabilityHash, payloadDigest } = await computeCapabilityDigests(snapshot);
    const lock: CapabilitiesLock = {
      acf: 1,
      entries: [
        {
          capabilityHash,
          capabilityNames: ["review-kit"],
          exclude: { skills: ["draft"] },
          source: "path:../plugin",
          sourceId: "path:/plugin",
          resolvedCapabilities: [
            {
              name: "review-kit",
              format: "claude-plugin",
              path: ".",
              payloadDigest,
              capabilityHash,
            },
          ],
        },
      ],
    };

    const { capabilities, diagnostics } = await resolveScopeCapabilities(scope, { lock });

    expect(diagnostics).toEqual([]);
    expect(capabilities[0]?.skills.map((skill) => skill.name)).toEqual(["review"]);
  } finally {
    await cleanup(dir);
  }
});

test("a renamed native snapshot resolves under its locked name", async () => {
  const dir = await tempDir("acf-resolver-rename-");
  try {
    const scope = scopeRoot("project", dir);
    const snapshot = path.join(scope.capabilitiesDir, "kit-one");
    await writeText(path.join(snapshot, "acf.yml"), "acf: 1\nname: review-kit\nversion: 1.0.0\n");
    const { capabilityHash, payloadDigest } = await computeCapabilityDigests(snapshot);
    const lock: CapabilitiesLock = {
      acf: 1,
      entries: [
        {
          capabilityHash,
          capabilityNames: ["kit-one"],
          rename: "kit-one",
          source: "path:../pkg",
          sourceId: "path:/pkg",
          resolvedCapabilities: [
            {
              name: "kit-one",
              format: "acf",
              path: ".",
              payloadDigest,
              capabilityHash,
            },
          ],
        },
      ],
    };

    const { capabilities, diagnostics } = await resolveScopeCapabilities(scope, { lock });

    expect(diagnostics).toEqual([]);
    expect(capabilities.map((cap) => [cap.manifest.name, cap.source?.renamedFrom])).toEqual([
      ["kit-one", "review-kit"],
    ]);
  } finally {
    await cleanup(dir);
  }
});
