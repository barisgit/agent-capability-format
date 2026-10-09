import path from "node:path";
import { pushZodIssues } from "../diagnostics/index.js";
import { hookFileSchema } from "../schemas/index.js";
import { isTargetId } from "../targets/registry.js";
import type { Diagnostic, HookEntry, HookFile, NativeHooks } from "../types/index.js";
import { narrowToTarget, parseYamlFile, pickFamilyYaml } from "./helpers.js";

/**
 * Reads `hooks/hooks.yml` (or `.yaml`): the canonical event buckets, plus the family-level
 * target blocks as {@link HookFile.native}. `undefined` when the file is absent or fails its
 * schema; the problems are pushed to `diagnostics`.
 */
export async function readHooks(
  root: string,
  diagnostics: Diagnostic[],
): Promise<HookFile | undefined> {
  const file = await pickFamilyYaml(
    path.join(root, "hooks"),
    "hooks",
    "acf.hooks.duplicate-file",
    diagnostics,
  );
  if (file === undefined) return undefined;
  const parsed = hookFileSchema.safeParse(await parseYamlFile(file, diagnostics));
  if (!parsed.success) {
    // Only the family-level target blocks reject unknown keys.
    pushZodIssues(diagnostics, parsed.error, file, {
      baseCode: "acf.hooks.invalid-field",
      family: "hook",
      unknownKeyCode: "acf.target.extension.unknown-field",
    });
    return undefined;
  }
  const data = parsed.data;
  const buckets: HookFile["buckets"] = {};
  if (data.session_start !== undefined) buckets.session_start = data.session_start as HookEntry[];
  if (data.user_prompt_submit !== undefined)
    buckets.user_prompt_submit = data.user_prompt_submit as HookEntry[];
  if (data.pre_tool !== undefined) buckets.pre_tool = data.pre_tool as HookEntry[];
  if (data.permission_request !== undefined)
    buckets.permission_request = data.permission_request as HookEntry[];
  if (data.post_tool !== undefined) buckets.post_tool = data.post_tool as HookEntry[];
  if (data.stop !== undefined) buckets.stop = data.stop as HookEntry[];
  if (data.pre_compact !== undefined) buckets.pre_compact = data.pre_compact as HookEntry[];
  const hookFile: HookFile = { path: file, buckets };
  const native = nativeHooks(
    data.targets as Record<string, { hooks?: Record<string, HookEntry[]> }> | undefined,
    file,
    diagnostics,
  );
  if (native !== undefined) hookFile.native = native;
  return hookFile;
}

/**
 * The family-level `targets.<target>.hooks` blocks (SPEC.md §13.9) as entries that apply to
 * `<target>` only (see {@link narrowToTarget}). An unknown block target id is reported and the
 * block left out.
 */
function nativeHooks(
  targets: Record<string, { hooks?: Record<string, HookEntry[]> }> | undefined,
  file: string,
  diagnostics: Diagnostic[],
): NativeHooks | undefined {
  if (targets === undefined) return undefined;
  const unknownTarget = (id: string): void => {
    diagnostics.push({
      severity: "error",
      code: "acf.target.unknown-id",
      message: `unknown target id: ${id}`,
      path: file,
      family: "hook",
      targetId: id,
    });
  };
  const out: NativeHooks = {};
  for (const [target, block] of Object.entries(targets)) {
    if (!isTargetId(target)) {
      unknownTarget(target);
      continue;
    }
    const events: Record<string, HookEntry[]> = {};
    for (const [event, entries] of Object.entries(block.hooks ?? {})) {
      events[event] = entries.map((entry) => narrowToTarget(entry, target, unknownTarget));
    }
    out[target] = events;
  }
  return out;
}
