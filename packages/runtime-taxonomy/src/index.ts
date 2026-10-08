// @caplet/runtime-taxonomy
//
// Reserved package for the runtime taxonomy (operation, event, permission,
// message-surface vocabularies). In acf:1 the only canonical artifact is the
// provisional operation set from SPEC §24; it lives in `@caplet/core` as the
// authoritative constant. This package re-exports it so direct consumers
// have a stable import path once the taxonomy graduates into its own repo.

export const provisionalOperations = [
  "shell",
  "file_read",
  "file_write",
  "file_edit",
  "web_fetch",
  "web_search",
  "code_search",
  "doc_search",
  "agent_delegate",
  "task_management",
  "mcp",
  "context",
  "any",
] as const;

export type ProvisionalOperationId = (typeof provisionalOperations)[number];

export function isProvisionalOperation(value: string): value is ProvisionalOperationId {
  return (provisionalOperations as readonly string[]).includes(value);
}

export const canonicalHookTypes = [
  "session_start",
  "user_prompt_submit",
  "pre_tool",
  "permission_request",
  "post_tool",
  "stop",
  "pre_compact",
] as const;

export type CanonicalHookType = (typeof canonicalHookTypes)[number];

export function isCanonicalHookType(value: string): value is CanonicalHookType {
  return (canonicalHookTypes as readonly string[]).includes(value);
}

export const canonicalTriggerNames = [
  "assistant_output",
  "operation_input",
  "operation_result",
  "file_context",
] as const;

export type CanonicalTriggerName = (typeof canonicalTriggerNames)[number];

export function isCanonicalTriggerName(value: string): value is CanonicalTriggerName {
  return (canonicalTriggerNames as readonly string[]).includes(value);
}
