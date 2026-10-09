import { type ReadOnlyFs, registerAdapter, type TargetAdapter, targetMap } from "@caplet/core";
import { emitTarget } from "../common/target.js";

const target = targetMap.pi;
if (target === undefined) throw new Error("missing target definition for pi");

/** Pi: loose files only, through the shared writers unchanged. */
export const piAdapter: TargetAdapter<"pi"> = {
  id: "pi",
  emit: (input, fs: ReadOnlyFs) => emitTarget(input, fs, target),
};

registerAdapter("pi", piAdapter);
