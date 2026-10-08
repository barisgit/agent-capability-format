import { expect, test } from "bun:test";
import {
  claudeAdapter,
  computeContentHash,
  provisionalOperations,
  resolveCapabilities,
} from "@caplet/sdk";

test("@caplet/sdk re-exports core, adapters, and installer symbols", () => {
  expect(provisionalOperations).toContain("shell");
  expect(typeof computeContentHash).toBe("function");
  expect(claudeAdapter.id).toBe("claude");
  expect(typeof resolveCapabilities).toBe("function");
});
