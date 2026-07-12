import { describe, expect, test } from "bun:test";
import { unknownFlagError } from "../src/internal/spec";

describe("unknownFlagError", () => {
  test("suggests --help for --hel", () => {
    expect(unknownFlagError(undefined, ["--hel"])).toBe("unknown flag: --hel — did you mean --help?");
  });

  test("suggests --dry-run for --dryrun on apply", () => {
    expect(unknownFlagError("apply", ["--dryrun"])).toBe(
      "unknown flag: --dryrun — did you mean --dry-run?",
    );
  });

  test("accepts valid flags, values, bundles, and separators", () => {
    expect(unknownFlagError("apply", ["-n", "--offline", "-s", "user", "--cwd=/tmp"])).toBeUndefined();
    expect(unknownFlagError("apply", ["-nv"])).toBeUndefined();
    expect(unknownFlagError("apply", ["--", "--not-a-flag"])).toBeUndefined();
  });

  test("rejects command-specific flags on other commands", () => {
    expect(unknownFlagError("status", ["--dry-run"])).toContain("unknown flag: --dry-run");
  });

  test("unknown flag without close match has no hint", () => {
    expect(unknownFlagError("status", ["--zzzqqq"])).toBe("unknown flag: --zzzqqq");
  });
});
