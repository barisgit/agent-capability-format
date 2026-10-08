import { type ReadOnlyFs, registerAdapter, type TargetAdapter, targetMap } from "@caplet/core";
import { emitTarget } from "../common/target.js";

const target = targetMap.opencode;
if (target === undefined) throw new Error("missing target definition for opencode");

export const opencodeAdapter: TargetAdapter<"opencode"> = {
  id: "opencode",
  emit: (input, fs: ReadOnlyFs) =>
    emitTarget(input, fs, target, { lossyPartialFamilies: ["command"] }),
};

registerAdapter("opencode", opencodeAdapter);
