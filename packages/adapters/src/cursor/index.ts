import {
  registerAdapter,
  type Diagnostic,
  type EmitResult,
  type ReadOnlyFs,
  type TargetAdapter,
} from "@acf/core";
import { emitStandardAdapter, layoutFor } from "../common/emitter";

export const cursorAdapter: TargetAdapter<"cursor"> = {
  id: "cursor",
  async emit(input, fs: ReadOnlyFs): Promise<EmitResult> {
    const diagnostics: Diagnostic[] = [];
    const diffs = await emitStandardAdapter(
      input,
      fs,
      layoutFor("cursor", input.installRoot, input.scope),
      diagnostics,
      { cursorRulesOnly: true, skipUnsupportedHooks: true },
    );
    return { diffs, diagnostics };
  },
};

registerAdapter("cursor", cursorAdapter);
