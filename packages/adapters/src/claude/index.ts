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

const claudeTarget = targetMap.claude;
if (claudeTarget === undefined) throw new Error("missing target definition for claude");

export const claudeAdapter: TargetAdapter<"claude"> = {
  id: "claude",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const diffs = [
      ...(await emitSkills(
        input.capability,
        input.scope,
        fs,
        claudeTarget,
        input.options.skills,
        diagnostics,
      )),
      ...(await emitStandardAdapter(
        input,
        fs,
        layoutFor("claude", input.installRoot, input.scope),
        diagnostics,
      )),
    ];
    return { diffs, diagnostics };
  },
};

registerAdapter("claude", claudeAdapter);
