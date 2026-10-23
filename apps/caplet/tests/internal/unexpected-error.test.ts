import { expect, test } from "bun:test";
import { describeUnexpectedError } from "../../src/internal/command.js";

test("unexpected errors retain their errno and message even when the stack omits them", () => {
  for (const prefix of ["EACCES: ", ""]) {
    const error = Object.assign(
      new Error(`${prefix}permission denied, open '/project/.codex/output'`),
      {
        code: "EACCES",
        // Bun 1.3.12 can return an async filesystem stack without the error's message.
        stack: "Error\n    at async writeContent (apply-diffs.ts:329:9)",
      },
    );
    const { message, detail } = describeUnexpectedError(error);
    for (const text of [message, detail]) {
      expect(text).toContain("EACCES");
      expect(text).toContain(error.message);
    }
    expect(detail).toContain("at async writeContent (apply-diffs.ts:329:9)");
  }
});

test("unexpected errors keep a complete stack without repeating the message", () => {
  const error = Object.assign(new Error("EACCES: permission denied"), {
    code: "EACCES",
    stack: "Error: EACCES: permission denied\n    at writeContent (apply-diffs.ts:329:9)",
  });
  expect(describeUnexpectedError(error)).toEqual({ message: error.message, detail: error.stack });
});

test("unexpected throws without a stack still have a description", () => {
  const error = new Error("failed to write");
  delete error.stack;
  expect(describeUnexpectedError(error).detail).toContain(error.message);
  expect(describeUnexpectedError("failed to write")).toEqual({
    message: "failed to write",
    detail: "failed to write",
  });
});
