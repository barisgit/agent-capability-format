import { type ReadOnlyFs, registerAdapter, type TargetAdapter, targetMap } from "@caplet/core";
import { emitTarget } from "../common/target.js";

const target = targetMap.cursor;
if (target === undefined) throw new Error("missing target definition for cursor");

export const cursorAdapter: TargetAdapter<"cursor"> = {
  id: "cursor",
  emit: (input, fs: ReadOnlyFs) =>
    emitTarget(input, fs, target, { cursorRulesOnly: true, skipUnsupportedHooks: true }),
};

registerAdapter("cursor", cursorAdapter);
