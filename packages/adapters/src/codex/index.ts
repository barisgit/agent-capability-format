import {
  type Diagnostic,
  type EmitResult,
  type ReadOnlyFs,
  registerAdapter,
  type TargetAdapter,
  targetMap,
} from "@acf/core";
import { emitStandardAdapter, layoutFor } from "../common/emitter";
import { emitSkills } from "../common/skills";

const codexTarget = targetMap.codex;
if (codexTarget === undefined) throw new Error("missing target definition for codex");

export const codexAdapter: TargetAdapter<"codex"> = {
  id: "codex",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const diffs = [
      ...(await emitSkills(input.capability, input.scope, fs, codexTarget, input.options.skills)),
      ...(await emitStandardAdapter(
        input,
        fs,
        layoutFor("codex", input.installRoot, input.scope),
        diagnostics,
        {
          lossyPartialFamilies: ["command"],
        },
      )),
    ];
    return { diffs, diagnostics };
  },
};

registerAdapter("codex", codexAdapter);
