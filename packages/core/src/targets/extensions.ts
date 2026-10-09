import { z } from "zod";
import { hookEntrySchema } from "../schemas/index.js";

const stringArray = z.array(z.string());
const unknownRecord = z.record(z.string(), z.unknown());
/** Native keys in the target's own spelling (capability-model-layers, Inline native extras). */
const native = unknownRecord.optional();

const capabilityExtension = z
  .object({
    pluginAuthor: z.string().optional(),
    appId: z.string().optional(),
    scope: z.enum(["user", "project"]).optional(),
    native,
    // Per-target package values; validated in the target's own domain by the reader.
    package: unknownRecord.optional(),
  })
  .strict();

const skillExtension = z
  .object({
    userInvocable: z.boolean().optional(),
    modelInvocable: z.boolean().optional(),
    disableModelInvocation: z.boolean().optional(),
    path: z.string().optional(),
    native,
  })
  .strict();

const agentExtension = z
  .object({
    tools: stringArray.optional(),
    permissions: unknownRecord.optional(),
    model: z.string().optional(),
    mode: z.string().optional(),
  })
  .strict();

const commandExtension = z
  .object({
    argumentHint: z.string().optional(),
    model: z.string().optional(),
    subtask: z.boolean().optional(),
    agent: z.string().optional(),
  })
  .strict();

const instructionExtension = z
  .object({
    globs: stringArray.optional(),
    paths: stringArray.optional(),
    alwaysApply: z.boolean().optional(),
    ruleType: z.string().optional(),
    triggers: unknownRecord.optional(),
  })
  .strict();

const hookExtension = z
  .object({
    hooks: z.record(z.string(), z.array(hookEntrySchema)).optional(),
    runInBackground: z.boolean().optional(),
  })
  .strict();

/**
 * A server's `targets.<target>`: only inline native extras. Install scope comes from the
 * capability entry, and loopback `http://` URLs are allowed by the canonical URL rule.
 */
const mcpExtension = z.object({ native }).strict();

/** The `targets.<target>` schema of each family; every built-in target accepts the same keys. */
export const commonTargetExtensionSchemas = {
  capability: capabilityExtension,
  skill: skillExtension,
  agent: agentExtension,
  command: commandExtension,
  instruction: instructionExtension,
  hook: hookExtension,
  mcp: mcpExtension,
} as const;
