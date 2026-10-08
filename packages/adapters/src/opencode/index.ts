import {
  type Diagnostic,
  type EmitResult,
  type ReadOnlyFs,
  registerAdapter,
  type TargetAdapter,
  targetMap,
} from "@caplet/core";
import { emitStandardAdapter, layoutFor } from "../common/emitter.js";
import { emitSkills } from "../common/skills.js";

const opencodeTarget = targetMap.opencode;
if (opencodeTarget === undefined) throw new Error("missing target definition for opencode");

export const opencodeAdapter: TargetAdapter<"opencode"> = {
  id: "opencode",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const diffs = [
      ...(await emitSkills(
        input.capability,
        input.scope,
        fs,
        opencodeTarget,
        input.options.skills,
        diagnostics,
      )),
      ...(await emitStandardAdapter(
        input,
        fs,
        layoutFor("opencode", input.installRoot, input.scope),
        diagnostics,
        { lossyPartialFamilies: ["command"] },
      )),
    ];
    return { diffs, diagnostics };
  },
};

registerAdapter("opencode", opencodeAdapter);
