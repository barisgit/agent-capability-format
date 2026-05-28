import {
  registerAdapter,
  type Diagnostic,
  type EmitResult,
  type ReadOnlyFs,
  type TargetAdapter,
} from "@acf/core";
import { emitStandardAdapter, layoutFor } from "../common/emitter";
import { emitSkillsCanonical } from "../common/skills";

export const codexAdapter: TargetAdapter<"codex"> = {
  id: "codex",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const diffs = [
      ...(await emitSkillsCanonical(input.capability, input.scope, fs, input.capability.manifest.name)),
      ...(await emitStandardAdapter(input, fs, layoutFor("codex", input.installRoot, input.scope), diagnostics, {
        lossyPartialFamilies: ["command"],
      })),
    ];
    return { diffs, diagnostics };
  },
};

registerAdapter("codex", codexAdapter);
