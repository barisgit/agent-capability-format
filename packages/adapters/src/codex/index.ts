import { type ReadOnlyFs, registerAdapter, type TargetAdapter, targetMap } from "@caplet/core";
import { emitTarget } from "../common/target.js";

const target = targetMap.codex;
if (target === undefined) throw new Error("missing target definition for codex");

export const codexAdapter: TargetAdapter<"codex"> = {
  id: "codex",
  emit: (input, fs: ReadOnlyFs) =>
    emitTarget(input, fs, target, { lossyPartialFamilies: ["command"] }),
};

registerAdapter("codex", codexAdapter);
