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
