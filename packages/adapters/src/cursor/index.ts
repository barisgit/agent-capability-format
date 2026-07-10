import {
  registerAdapter,
  targetMap,
  type Diagnostic,
  type EmitResult,
  type ReadOnlyFs,
  type TargetAdapter,
} from "@acf/core";
import { emitStandardAdapter, layoutFor } from "../common/emitter";
import { emitSkills } from "../common/skills";

const cursorTarget = targetMap.cursor;
if (cursorTarget === undefined) throw new Error("missing target definition for cursor");

export const cursorAdapter: TargetAdapter<"cursor"> = {
  id: "cursor",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const diffs = [
      ...(await emitSkills(
        input.capability,
        input.scope,
        fs,
        cursorTarget,
        { ...input.options.skills, native: false },
        diagnostics,
      )),
      ...(await emitStandardAdapter(
        input,
        fs,
        layoutFor("cursor", input.installRoot, input.scope),
        diagnostics,
        { cursorRulesOnly: true, skipUnsupportedHooks: true },
      )),
    ];
    return { diffs, diagnostics };
  },
};

registerAdapter("cursor", cursorAdapter);
