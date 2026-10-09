import { expect, test } from "bun:test";
import { deleteJsonPointerText } from "../src/apply/json-pointer";

test("deleting a property from the compact layout main wrote keeps its unmanaged neighbors", () => {
  // main's merge replaced an existing server in a compact user file in place, so the owned
  // property shares its line with the start of the document.
  const written =
    '{"mcpServers":{"foo":{\n  "command": "caplet-run",\n  "args": [\n    "x"\n  ]\n},"keep":{"command":"user"}}}\n';

  expect(deleteJsonPointerText(written, "/mcpServers/foo")).toBe(
    '{"mcpServers":{"keep":{"command":"user"}}}\n',
  );
});

test("deleting a compact array element removes only that element and its comma", () => {
  expect(deleteJsonPointerText('{"a":[1,2,3]}', "/a/0")).toBe('{"a":[2,3]}');
  expect(deleteJsonPointerText('{"a":[1,2,3]}', "/a/1")).toBe('{"a":[1,3]}');
  expect(deleteJsonPointerText("[1, 2]", "/0")).toBe("[2]");
});

test("deleting a property that shares a line with a neighbor keeps the neighbor", () => {
  expect(deleteJsonPointerText('{\n  "x": 1, "a": 2,\n  "b": 3\n}\n', "/a")).toBe(
    '{\n  "x": 1,\n  "b": 3\n}\n',
  );
  expect(deleteJsonPointerText('{\n  "a": 2, "b": 3\n}\n', "/a")).toBe('{\n  "b": 3\n}\n');
});

test("deleting a property on its own line removes the whole line", () => {
  expect(deleteJsonPointerText('{\n  "a": 1,\n  "b": 2\n}\n', "/a")).toBe('{\n  "b": 2\n}\n');
});
