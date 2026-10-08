import { type ReadOnlyFs, registerAdapter, type TargetAdapter, targetMap } from "@caplet/core";
import { emitTarget } from "../common/target.js";

const target = targetMap.claude;
if (target === undefined) throw new Error("missing target definition for claude");

export const claudeAdapter: TargetAdapter<"claude"> = {
  id: "claude",
  emit: (input, fs: ReadOnlyFs) => emitTarget(input, fs, target),
};

registerAdapter("claude", claudeAdapter);
