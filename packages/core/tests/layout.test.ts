import { expect, test } from "bun:test";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("singular facet folders at capability root are errors", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "skill/README.md": "bad\n",
    "agent/README.md": "bad\n",
    "command/README.md": "bad\n",
    "instruction/README.md": "bad\n",
    "hook/README.md": "bad\n",
    "mcps/README.md": "bad\n",
  });
  try {
    expect(codes(cap).filter((code) => code === "acf.layout.singular-facet-folder")).toHaveLength(
      6,
    );
  } finally {
    await cleanup(dir);
  }
});
