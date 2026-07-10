import { describe, expect, test } from "bun:test";
import {
  canonicalHookTypes,
  canonicalTriggerNames,
  isCanonicalHookType,
  isCanonicalTriggerName,
  isProvisionalOperation,
  provisionalOperations,
} from "../src/index";

describe("runtime-taxonomy", () => {
  test("provisionalOperations is the SPEC §24 list", () => {
    expect(provisionalOperations).toContain("shell");
    expect(provisionalOperations).toContain("any");
    expect(provisionalOperations).toHaveLength(13);
  });

  test("isProvisionalOperation accepts and rejects correctly", () => {
    expect(isProvisionalOperation("shell")).toBe(true);
    expect(isProvisionalOperation("not_real")).toBe(false);
  });

  test("canonicalHookTypes covers SPEC §13.2", () => {
    expect(canonicalHookTypes).toHaveLength(7);
    expect(isCanonicalHookType("session_start")).toBe(true);
    expect(isCanonicalHookType("PreToolUse")).toBe(false);
  });

  test("canonicalTriggerNames covers SPEC §12.5", () => {
    expect(canonicalTriggerNames).toHaveLength(4);
    expect(isCanonicalTriggerName("assistant_output")).toBe(true);
    expect(isCanonicalTriggerName("unknown")).toBe(false);
  });
});
