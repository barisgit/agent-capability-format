import { expect, test } from "bun:test";
import { baseManifest, cleanup, codes, readTempCapability } from "./helpers";

test("MCP stdio requires command", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "mcp/mcp.yml": "servers:\n  - name: fs\n    transport: stdio\n",
  });
  try {
    expect(codes(cap)).toContain("acf.mcp.transport.missing-command");
  } finally {
    await cleanup(dir);
  }
});

test("MCP http and sse require url", async () => {
  const { cap, dir } = await readTempCapability({
    "acf.yml": baseManifest,
    "mcp/mcp.yml":
      "servers:\n  - name: http-server\n    transport: http\n  - name: sse-server\n    transport: sse\n",
  });
  try {
    expect(codes(cap).filter((code) => code === "acf.mcp.transport.missing-url").length).toBe(2);
  } finally {
    await cleanup(dir);
  }
});

test("an unknown target id in a family-level server block names the target", async () => {
  for (const [block, id] of [
    ["  nope:\n    servers: []\n", "nope"],
    [
      "  codex:\n    servers:\n      - name: one\n        transport: stdio\n        command: node\n        only: [ghost]\n",
      "ghost",
    ],
  ]) {
    const { cap, dir } = await readTempCapability({
      "acf.yml": baseManifest,
      "mcp/mcp.yml": `servers: []\ntargets:\n${block}`,
    });
    try {
      expect(
        cap.diagnostics
          .filter((d) => d.code === "acf.target.unknown-id")
          .map((d) => [d.family, d.targetId]),
      ).toEqual([["mcp", id]]);
    } finally {
      await cleanup(dir);
    }
  }
});
