import { expect, test } from "bun:test";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("agents detect file and directory duplicate form", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "agents/reviewer.md": "---\nname: reviewer\ndescription: Reviewer\n---\nbody\n",
    "agents/reviewer/AGENT.md": "---\nname: reviewer\ndescription: Reviewer\n---\nbody\n",
  });
  try {
    expect(codes(cap)).toContain("acf.facet.duplicate");
  } finally {
    await cleanup(dir);
  }
});

test("commands and instructions support directory form", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "commands/review/COMMAND.md":
      "---\nname: review\ndescription: Review\narguments: [focus]\n---\nbody\n",
    "instructions/style/INSTRUCTION.md":
      "---\nname: style\ndescription: Style\nactivation: always\n---\nbody\n",
  });
  try {
    expect(cap.commands).toHaveLength(1);
    expect(cap.instructions).toHaveLength(1);
  } finally {
    await cleanup(dir);
  }
});
