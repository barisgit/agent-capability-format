import { homedir } from "node:os";
import path from "node:path";
import type {
  CanonicalHookType,
  CanonicalTriggerName,
  FamilySupportFamily,
  TargetAdapter,
  TargetDefinition,
  TargetId,
} from "../types/index.js";
import { isSlug } from "../utils/guards.js";
import { commonTargetExtensionSchemas } from "./extensions.js";

const HOME = homedir();
const hookKeys: readonly CanonicalHookType[] = [
  "session_start",
  "user_prompt_submit",
  "pre_tool",
  "permission_request",
  "post_tool",
  "stop",
  "pre_compact",
];
const triggerKeys: readonly CanonicalTriggerName[] = [
  "assistant_output",
  "operation_input",
  "operation_result",
  "file_context",
];

export function defineTarget<const Id extends string>(
  target: TargetDefinition<Id>,
): TargetDefinition<Id> {
  if (!isSlug(target.id)) throw new Error(`invalid target id: ${target.id}`);
  for (const key of hookKeys) {
    if (!(key in target.mappings.hookEvents))
      throw new Error(`missing hook mapping ${target.id}.${key}`);
  }
  for (const key of triggerKeys) {
    if (!(key in target.mappings.instructionTriggers))
      throw new Error(`missing trigger mapping ${target.id}.${key}`);
  }
  return target;
}

export function defineTargets<const T extends readonly TargetDefinition<string>[]>(defs: T): T {
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.id)) throw new Error(`duplicate target id: ${def.id}`);
    seen.add(def.id);
  }
  return defs;
}

export const targets = defineTargets([
  defineTarget({
    id: "claude",
    displayName: "Claude Code",
    support: {
      agent: "full",
      command: "full",
      instruction: "partial",
      hook: "none",
    },
    installPaths: { user: path.join(HOME, ".claude"), project: path.join(".", ".claude") },
    skillInstallPaths: {
      user: path.join(HOME, ".claude", "skills"),
      project: path.join(".", ".claude", "skills"),
    },
    mappings: {
      hookEvents: {
        session_start: ["SessionStart"],
        user_prompt_submit: ["UserPromptSubmit"],
        pre_tool: ["PreToolUse"],
        permission_request: ["PreToolUse"],
        post_tool: ["PostToolUse"],
        stop: ["Stop"],
        pre_compact: ["PreCompact"],
      },
      instructionTriggers: {
        assistant_output: "partial",
        operation_input: "full",
        operation_result: "partial",
        file_context: "full",
      },
      mcpInstallPath: {
        user: path.join(HOME, ".claude", "mcp.json"),
        project: path.join(".", ".mcp.json"),
      },
    },
    extensions: commonTargetExtensionSchemas,
  }),
  defineTarget({
    id: "codex",
    displayName: "Codex",
    discoversCanonicalSkills: true,
    support: {
      agent: "full",
      command: "partial",
      instruction: "partial",
      hook: "none",
    },
    installPaths: { user: path.join(HOME, ".codex"), project: path.join(".", ".codex") },
    skillInstallPaths: {
      user: path.join(HOME, ".codex", "skills"),
      project: path.join(".", ".codex", "skills"),
    },
    mappings: {
      hookEvents: {
        session_start: ["SessionStart"],
        user_prompt_submit: ["UserPromptSubmit"],
        pre_tool: ["PreToolUse"],
        permission_request: ["PermissionRequest"],
        post_tool: ["PostToolUse"],
        stop: ["Stop"],
        pre_compact: [],
      },
      instructionTriggers: {
        assistant_output: "partial",
        operation_input: "full",
        operation_result: "partial",
        file_context: "full",
      },
      mcpInstallPath: {
        user: path.join(HOME, ".codex", "config.toml"),
        project: path.join(".", ".codex", "config.toml"),
      },
    },
    extensions: commonTargetExtensionSchemas,
  }),
  defineTarget({
    id: "cursor",
    displayName: "Cursor",
    discoversCanonicalSkills: true,
    support: {
      agent: "partial",
      command: "partial",
      instruction: "partial",
      hook: "none",
    },
    installPaths: { user: path.join(HOME, ".cursor"), project: path.join(".", ".cursor") },
    mappings: {
      hookEvents: {
        session_start: [],
        user_prompt_submit: [],
        pre_tool: [],
        permission_request: [],
        post_tool: [],
        stop: [],
        pre_compact: [],
      },
      instructionTriggers: {
        assistant_output: "none",
        operation_input: "none",
        operation_result: "none",
        file_context: "partial",
      },
      mcpInstallPath: {
        user: path.join(HOME, ".cursor", "mcp.json"),
        project: path.join(".", ".cursor", "mcp.json"),
      },
    },
    extensions: commonTargetExtensionSchemas,
  }),
  defineTarget({
    id: "opencode",
    displayName: "OpenCode",
    discoversCanonicalSkills: true,
    support: {
      agent: "full",
      command: "partial",
      instruction: "partial",
      hook: "none",
    },
    installPaths: {
      user: path.join(HOME, ".config", "opencode"),
      project: path.join(".", ".opencode"),
    },
    skillInstallPaths: {
      user: path.join(HOME, ".config", "opencode", "skills"),
      project: path.join(".", ".opencode", "skills"),
    },
    mappings: {
      hookEvents: {
        session_start: ["session.start"],
        user_prompt_submit: ["prompt.before"],
        pre_tool: ["tool.execute.before"],
        permission_request: ["permission.asked"],
        post_tool: ["tool.execute.after"],
        stop: ["agent.stop"],
        pre_compact: ["session.compact.before"],
      },
      instructionTriggers: {
        assistant_output: "partial",
        operation_input: "full",
        operation_result: "partial",
        file_context: "partial",
      },
      mcpInstallPath: {
        user: path.join(HOME, ".config", "opencode", "opencode.json"),
        project: path.join(".", "opencode.json"),
      },
    },
    extensions: commonTargetExtensionSchemas,
  }),
  defineTarget({
    id: "pi",
    displayName: "Pi",
    discoversCanonicalSkills: true,
    support: {
      agent: "full",
      command: "full",
      instruction: "full",
      hook: "none",
    },
    installPaths: {
      user: path.join(HOME, ".pi", "agent"),
      project: path.join(".", ".pi"),
    },
    skillInstallPaths: {
      user: path.join(HOME, ".pi", "agent", "skills"),
      project: path.join(".", ".pi", "skills"),
    },
    mappings: {
      hookEvents: {
        session_start: ["session_start"],
        user_prompt_submit: ["prompt_submit"],
        pre_tool: ["tool_call_before"],
        permission_request: [],
        post_tool: ["tool_call_after"],
        stop: ["stop"],
        pre_compact: ["pre_compact"],
      },
      instructionTriggers: {
        assistant_output: "full",
        operation_input: "full",
        operation_result: "partial",
        file_context: "partial",
      },
      mcpInstallPath: {
        user: path.join(HOME, ".pi", "agent", "mcp.json"),
        project: path.join(".", ".pi", "mcp.json"),
      },
    },
    extensions: commonTargetExtensionSchemas,
  }),
] as const);

export const targetIds: readonly TargetId[] = targets.map((target) => target.id);
export const targetMap: Readonly<Record<TargetId, TargetDefinition<TargetId>>> = Object.fromEntries(
  targets.map((target) => [target.id, target]),
);
/** Families whose support is still declared per target rather than per field (see `fieldSupport`). */
export const familySupportFamilies: readonly FamilySupportFamily[] = [
  "agent",
  "command",
  "instruction",
  "hook",
];

export function isTargetId(value: unknown): value is TargetId {
  return typeof value === "string" && targetIds.includes(value);
}

export function registerAdapter<Id extends TargetId>(id: Id, adapter: TargetAdapter<Id>): void {
  const target = targetMap[id];
  if (target === undefined) throw new Error(`unknown target id: ${id}`);
  (target as TargetDefinition<Id>).adapter = adapter;
}
