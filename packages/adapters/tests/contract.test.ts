import { expect, test } from "bun:test";
import { adapters } from "../src";
import { emitInput, readFixtureCapability } from "./util/capability";
import { makeInMemoryFs } from "./util/in-memory-fs";

for (const [id, adapter] of Object.entries(adapters)) {
  test(`${id} adapter emit contract`, async () => {
    const capability = await readFixtureCapability();
    const result = await adapter.emit(emitInput(capability, `.out/${id}`), makeInMemoryFs({}));
    expect(Array.isArray(result.diffs)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect("files" in result).toBe(false);
    for (const diff of result.diffs) {
      expect(typeof diff.path).toBe("string");
      expect(diff.path.length).toBeGreaterThan(0);
      expect(
        diff.before === null ||
          typeof diff.before === "string" ||
          diff.before instanceof Uint8Array,
      ).toBe(true);
      expect(
        diff.after === null || typeof diff.after === "string" || diff.after instanceof Uint8Array,
      ).toBe(true);
      expect(Array.isArray(diff.owns)).toBe(true);
      for (const own of diff.owns) {
        if (own.kind !== "file") {
          const sharedJson =
            diff.path.endsWith("settings.json") ||
            diff.path.endsWith("mcp.json") ||
            diff.path.endsWith(".mcp.json");
          const markedText = own.kind === "marker" && diff.path.endsWith("CLAUDE.md");
          expect(sharedJson || markedText).toBe(true);
        }
      }
    }
  });
}
