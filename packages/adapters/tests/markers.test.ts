import { expect, test } from "bun:test";
import { extractMarkedBlock, removeMarkedBlock, replaceMarkedBlock } from "../src/common/markers";

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

const foobar = '[mcp_servers.foobar]\ncommand = "foobar"';
const foo = '[mcp_servers.foo]\ncommand = "foo"';

test("a region name never matches a longer name it prefixes", () => {
  const onlyFoobar = replaceMarkedBlock("", "mcp_servers.foobar", foobar, "hash");

  expect(extractMarkedBlock(onlyFoobar, "mcp_servers.foo")).toBeNull();
  expect(removeMarkedBlock(onlyFoobar, "mcp_servers.foo")).toBe(onlyFoobar);
  expect(replaceMarkedBlock(onlyFoobar, "mcp_servers.foo", foo, "hash")).toBe(
    `${onlyFoobar}\n# acf:begin mcp_servers.foo\n${foo}\n# acf:end mcp_servers.foo\n`,
  );
});

test("a region after a region whose name it prefixes is found by its own markers", () => {
  const onlyFoobar = replaceMarkedBlock("", "mcp_servers.foobar", foobar, "hash");
  const both = replaceMarkedBlock(onlyFoobar, "mcp_servers.foo", foo, "hash");

  expect(extractMarkedBlock(both, "mcp_servers.foo")).toBe(foo);
  expect(extractMarkedBlock(both, "mcp_servers.foobar")).toBe(foobar);
  expect(removeMarkedBlock(both, "mcp_servers.foo")).toBe(onlyFoobar);
});

test("marker text that is not a whole line is not a marker", () => {
  const text = "see `<!-- acf:begin a -->` and `<!-- acf:end a -->` in the docs\n";

  expect(extractMarkedBlock(text, "a")).toBeNull();
  expect(removeMarkedBlock(text, "a")).toBe(text);
});
