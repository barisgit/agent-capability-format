import { expect, test } from "bun:test";
import { extrasDialects, nativeExtras, packageValues, withNativeExtras } from "../src/index.js";

test("extras are read per dialect and package values per target", () => {
  const targets = {
    claude: { native: { when_to_use: "x" }, package: { version: "2024.10" } },
    codex: { skill: { path: "y" } },
    "agent-plugins": { native: { unknown: 1 } },
  };
  expect(nativeExtras(targets, "claude")).toEqual({ when_to_use: "x" });
  expect(nativeExtras(targets, "codex")).toEqual({});
  expect(nativeExtras(undefined, "pi")).toEqual({});
  expect(packageValues({ targets }, "claude")).toEqual({ version: "2024.10" });
  expect(extrasDialects(targets)).toEqual(["claude", "agent-plugins"]);
});

test("withNativeExtras keeps other keys and dialects", () => {
  const targets = { claude: { skill: { path: "p" }, native: { a: 1 } }, pi: { native: { b: 2 } } };
  expect(withNativeExtras(targets, "claude", { c: 3 })).toEqual({
    claude: { skill: { path: "p" }, native: { a: 1, c: 3 } },
    pi: { native: { b: 2 } },
  });
  expect(targets.claude.native).toEqual({ a: 1 });
});
