import { expect, test } from "bun:test";
import { applicableTargets, computeSet } from "../src";
import { cleanup, codes, readTempCapability } from "./helpers";

test("computeSet supports only and except", () => {
  expect(computeSet({ only: ["claude"] }, ["claude", "codex"])).toEqual(["claude"]);
  expect(computeSet({ except: ["codex"] }, ["claude", "codex"])).toEqual(["claude"]);
});

test("facet applicability intersects with capability applicability and empty intersection emits info", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: test-cap\nversion: 1.0.0\nonly: [claude]\n",
    "agents/reviewer.md": "---\nname: reviewer\ndescription: Reviewer\nonly: [codex]\n---\nbody\n",
  });
  try {
    expect(applicableTargets(cap, cap.agents[0]?.frontmatter ?? {})).toEqual([]);
    expect(codes(cap)).toContain("acf.applicability.empty");
  } finally {
    await cleanup(dir);
  }
});

test("unknown applicability target ids suggest registry names", async () => {
  for (const field of ["only", "except"]) {
    const { cap, dir } = await readTempCapability({
      "acf.yml": `acf: 1\nname: test-cap\nversion: 1.0.0\n${field}: [cluade]\n`,
    });
    try {
      expect(cap.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "acf.target.unknown-id",
          message: expect.stringContaining('did you mean "claude"?'),
        }),
      );
    } finally {
      await cleanup(dir);
    }
  }
});

test("unknown target id is diagnosed", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": "acf: 1\nname: test-cap\nversion: 1.0.0\nonly: [unknown]\n",
  });
  try {
    expect(codes(cap)).toContain("acf.target.unknown-id");
  } finally {
    await cleanup(dir);
  }
});
