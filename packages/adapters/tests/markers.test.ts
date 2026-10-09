import { expect, test } from "bun:test";
import { removeMarkedBlock, replaceMarkedBlock } from "../src/common/markers";

const a = '[mcp_servers.a]\ncommand = "a"';
const b = '[mcp_servers.b]\ncommand = "b"';

test("removing a region takes the blank line that separated it", () => {
  const both = replaceMarkedBlock(replaceMarkedBlock("", "a", a, "hash"), "b", b, "hash");
  const onlyB = replaceMarkedBlock("", "b", b, "hash");
  const onlyA = replaceMarkedBlock("", "a", a, "hash");

  expect(removeMarkedBlock(both, "a")).toBe(onlyB);
  expect(removeMarkedBlock(both, "b")).toBe(onlyA);
  expect(removeMarkedBlock(onlyA, "a")).toBe("");
});

test("removing a region between user text keeps one blank line between them", () => {
  const text = replaceMarkedBlock('model = "x"\n', "a", a, "hash").concat("\n[profile]\n");

  expect(removeMarkedBlock(text, "a")).toBe('model = "x"\n\n[profile]\n');
});
