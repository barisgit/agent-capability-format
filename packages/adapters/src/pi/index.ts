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

const piTarget = targetMap.pi;
if (piTarget === undefined) throw new Error("missing target definition for pi");

export const piAdapter: TargetAdapter<"pi"> = {
  id: "pi",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const skillOptions = {
      ...input.options.skills,
      native: input.options.skills?.native ?? false,
    };
    const diffs = [
      ...(await emitSkills(input.capability, input.scope, fs, piTarget, skillOptions)),
      ...(await emitStandardAdapter(
        input,
        fs,
        layoutFor("pi", input.installRoot, input.scope),
        diagnostics,
      )),
    ];
    return { diffs, diagnostics };
  },
};

registerAdapter("pi", piAdapter);
