import { type ReadOnlyFs, registerAdapter, type TargetAdapter, targetMap } from "@caplet/core";
import { emitTarget } from "../common/target.js";

const target = targetMap.cursor;
if (target === undefined) throw new Error("missing target definition for cursor");

/** Cursor: loose files only; instructions become rules and hook files are not written. */
export const cursorAdapter: TargetAdapter<"cursor"> = {
  id: "cursor",
  emit: (input, fs: ReadOnlyFs) => emitTarget(input, fs, target, { cursorRulesOnly: true }),
};

registerAdapter("cursor", cursorAdapter);
