import { expect, test } from "bun:test";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("instruction debounce requires repeat always", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "instructions/guard.md":
      "---\nname: guard\ndescription: Guard\nactivation:\n  when:\n    assistant_output:\n      conditions: [danger]\n      debounce: 2\n---\nbody\n",
  });
  try {
    expect(codes(cap)).toContain("acf.instruction.debounce.requires-repeat-always");
  } finally {
    await cleanup(dir);
  }
});

test("instruction invalid regex, absolute paths, and unknown operations are diagnosed", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "instructions/guard.md":
      "---\nname: guard\ndescription: Guard\nactivation:\n  when:\n    operation_input:\n      conditions: ['[']\n      scope:\n        - operation: nativeTool\n          paths: ['/abs.ts']\n---\nbody\n",
  });
  try {
    const got = codes(cap);
    expect(got).toContain("acf.instruction.invalid-regex");
    expect(got).toContain("acf.path.absolute");
    expect(got).toContain("acf.runtime.unknown-operation");
  } finally {
    await cleanup(dir);
  }
});
