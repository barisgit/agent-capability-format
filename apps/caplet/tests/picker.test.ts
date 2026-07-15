import { describe, expect, test } from "bun:test";
import { parseNumberedSelection } from "../src/internal/picker";

describe("parseNumberedSelection", () => {
  test("empty and all select every item", () => {
    expect(parseNumberedSelection("", 4)).toEqual({ kind: "selected", indices: [0, 1, 2, 3] });
    expect(parseNumberedSelection("a", 3)).toEqual({ kind: "selected", indices: [0, 1, 2] });
    expect(parseNumberedSelection("all", 2)).toEqual({ kind: "selected", indices: [0, 1] });
  });

  test("parses comma-separated numbers and ranges in source order", () => {
    expect(parseNumberedSelection("3, 1, 2-4, 3", 5)).toEqual({
      kind: "selected",
      indices: [0, 1, 2, 3],
    });
  });

  test("recognizes cancellation", () => {
    expect(parseNumberedSelection("q", 3)).toEqual({ kind: "cancelled" });
    expect(parseNumberedSelection("quit", 3)).toEqual({ kind: "cancelled" });
  });

  test("rejects malformed and out-of-range selections", () => {
    expect(parseNumberedSelection("0", 3).kind).toBe("invalid");
    expect(parseNumberedSelection("4", 3).kind).toBe("invalid");
    expect(parseNumberedSelection("2-1", 3).kind).toBe("invalid");
    expect(parseNumberedSelection("1,nope", 3).kind).toBe("invalid");
  });

  test("rejects an empty option list", () => {
    expect(parseNumberedSelection("", 0).kind).toBe("invalid");
  });
});

import { selectCapabilities } from "../src/internal/picker";

function lines(values: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) yield value;
    },
  };
}

test("selectCapabilities retries invalid input and preserves candidate order", async () => {
  let output = "";
  const selected = await selectCapabilities(["alpha", "beta", "gamma"], {
    lines: lines(["nope", "3,1"]),
    write: (value) => {
      output += value;
    },
  });
  expect(selected).toEqual(["alpha", "gamma"]);
  expect(output).toContain("1. alpha");
  expect(output).toContain("enter numbers from 1-3");
});

test("selectCapabilities returns null on cancel or EOF", async () => {
  expect(
    await selectCapabilities(["alpha", "beta"], { lines: lines(["q"]), write: () => {} }),
  ).toBeNull();
  expect(
    await selectCapabilities(["alpha", "beta"], { lines: lines([]), write: () => {} }),
  ).toBeNull();
});

test("selectCapabilities default readline I/O consumes stdin and closes", async () => {
  const script = [
    'import { selectCapabilities } from "./src/internal/picker.ts";',
    'const selected = await selectCapabilities(["alpha", "beta"]);',
    "process.stderr.write(`RESULT=${JSON.stringify(selected)}\\n`);",
  ].join("\n");
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: import.meta.dir.replace(/\/tests$/, ""),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write("2\n");
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Select capabilities:");
  expect(stderr).toContain('RESULT=["beta"]');
});
