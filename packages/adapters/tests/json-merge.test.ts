import { expect, test } from "bun:test";
import { mergeJson } from "../src/common/json-merge";

test("a pointer segment naming __proto__ addresses an own entry", () => {
  const merged = mergeJson(null, "/hooks/__proto__/0", "x");
  expect(Object.hasOwn(Object.prototype, "0")).toBe(false);
  expect(JSON.parse(merged)).toEqual(JSON.parse('{"hooks":{"__proto__":["x"]}}'));
});
