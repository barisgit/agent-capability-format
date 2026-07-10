import type { CanonicalTriggerName } from "@acf/runtime-taxonomy";
import { canonicalTriggerNames } from "@acf/runtime-taxonomy";
import { z } from "zod";

export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const targetIdSchema = slugSchema;
export const targetsSchema = z.record(z.string(), z.unknown());

export const onlyExceptSchema = z
  .object({
    only: z.array(targetIdSchema).optional(),
    except: z.array(targetIdSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.only !== undefined && value.except !== undefined) {
      ctx.addIssue({ code: "custom", message: "only and except are mutually exclusive", path: [] });
    }
  });

const withOnlyExcept = <S extends z.ZodRawShape>(shape: S) => z.object(shape).and(onlyExceptSchema);

export const manifestSchema = withOnlyExcept({
  acf: z.literal(1),
  name: slugSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  description: z.string().optional(),
  authors: z.array(z.string()).optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  targets: targetsSchema.optional(),
});

const frontmatterBase = {
  assets: z.array(z.string()).optional(),
  targets: targetsSchema.optional(),
};

export const skillFrontmatterSchema = withOnlyExcept({
  name: slugSchema,
  description: z.string().min(1),
  invocation: z.object({ user: z.boolean().optional(), model: z.boolean().optional() }).optional(),
  ...frontmatterBase,
});

export const agentFrontmatterSchema = withOnlyExcept({
  name: slugSchema,
  description: z.string().min(1),
  mode: z.enum(["primary", "subagent", "all"]).optional(),
  model: z.literal("inherit").optional(),
  ...frontmatterBase,
});

export const commandFrontmatterSchema = withOnlyExcept({
  name: slugSchema,
  description: z.string().min(1),
  arguments: z.array(slugSchema).optional(),
  agent: z.string().optional(),
  ...frontmatterBase,
});

const scopeEntrySchema = z
  .object({
    operation: z.string().optional(),
    paths: z.array(z.string()).optional(),
  })
  .passthrough();

const triggerCommonSchema = z
  .object({
    scope: z.array(scopeEntrySchema).optional(),
    interrupt: z.enum(["never", "always"]).optional(),
    repeat: z.enum(["once", "always"]).optional(),
    debounce: z.number().int().positive().optional(),
  })
  .passthrough();

const regexTriggerSchema = triggerCommonSchema.extend({ conditions: z.array(z.string()).min(1) });
const fileContextTriggerSchema = triggerCommonSchema.extend({ paths: z.array(z.string()).min(1) });

function addTriggerChecks(value: unknown, ctx: z.RefinementCtx): void {
  if (typeof value !== "object" || value === null) return;
  const act = value as { activation?: unknown };
  if (act.activation === "always" || typeof act.activation !== "object" || act.activation === null)
    return;
  const when = (act.activation as { when?: unknown }).when;
  if (typeof when !== "object" || when === null) return;
  for (const name of canonicalTriggerNames) {
    const trigger = (when as Partial<Record<CanonicalTriggerName, unknown>>)[name];
    if (typeof trigger !== "object" || trigger === null) continue;
    const block = trigger as { conditions?: unknown; debounce?: unknown; repeat?: unknown };
    if (block.debounce !== undefined && block.repeat !== "always") {
      ctx.addIssue({
        code: "custom",
        message: "debounce requires repeat: always",
        path: ["activation", "when", name, "debounce"],
      });
    }
    if (Array.isArray(block.conditions)) {
      for (const [index, pattern] of block.conditions.entries()) {
        if (typeof pattern !== "string") continue;
        try {
          new RegExp(pattern);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: `invalid regex: ${pattern}`,
            path: ["activation", "when", name, "conditions", index],
          });
        }
      }
    }
  }
}

export const instructionFrontmatterSchema = withOnlyExcept({
  name: slugSchema,
  description: z.string().min(1),
  activation: z.union([
    z.literal("always"),
    z.object({
      when: z
        .object({
          assistant_output: regexTriggerSchema.optional(),
          operation_input: regexTriggerSchema.optional(),
          operation_result: regexTriggerSchema.optional(),
          file_context: fileContextTriggerSchema.optional(),
        })
        .refine(
          (when) => Object.keys(when).length > 0,
          "activation.when must declare at least one trigger",
        ),
    }),
  ]),
  ...frontmatterBase,
});

export const capabilityMarkdownFrontmatterSchema = z.object({
  sections: z.array(z.string()).optional(),
  targets: targetsSchema.optional(),
});

export const hookRunSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    shell: z.enum(["bash", "powershell"]).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export const hookMatchSchema = z.object({
  operation: z.string().optional(),
  paths: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
});

export const hookEntrySchema = withOnlyExcept({
  name: slugSchema,
  description: z.string().optional(),
  match: hookMatchSchema.optional(),
  run: hookRunSchema,
  effect: z.enum(["observe", "block", "add_context", "continue", "block_result", "decide"]),
  timeout: z.number().int().positive().optional(),
  targets: targetsSchema.optional(),
});

export const hookFileSchema = z.object({
  session_start: z.array(hookEntrySchema).optional(),
  user_prompt_submit: z.array(hookEntrySchema).optional(),
  pre_tool: z.array(hookEntrySchema).optional(),
  permission_request: z.array(hookEntrySchema).optional(),
  post_tool: z.array(hookEntrySchema).optional(),
  stop: z.array(hookEntrySchema).optional(),
  pre_compact: z.array(hookEntrySchema).optional(),
  targets: z
    .record(
      z.string(),
      z.object({ hooks: z.record(z.string(), z.array(hookEntrySchema)).optional() }),
    )
    .optional(),
});

const mcpServerBaseSchema = withOnlyExcept({
  name: slugSchema,
  description: z.string().optional(),
  targets: targetsSchema.optional(),
});

export const mcpServerSchema = mcpServerBaseSchema
  .and(
    z.object({
      transport: z.enum(["stdio", "http", "sse"]),
      command: z.string().min(1).optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      url: z.string().url().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
  )
  .superRefine((server, ctx) => {
    if (server.transport === "stdio" && server.command === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "stdio transport requires command",
        path: ["command"],
      });
    }
    if ((server.transport === "http" || server.transport === "sse") && server.url === undefined) {
      ctx.addIssue({ code: "custom", message: "http/sse transport requires url", path: ["url"] });
    }
    if (server.transport !== "stdio" && server.command !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "http/sse transport forbids command",
        path: ["command"],
      });
    }
  });

export const mcpFileSchema = z.object({
  servers: z.array(mcpServerSchema).default([]),
  targets: z
    .record(z.string(), z.object({ servers: z.array(mcpServerSchema).optional() }))
    .optional(),
});

const selectorSchema = z.record(
  z.enum(["skill", "agent", "command", "instruction", "hook", "mcp"]),
  z.array(z.string()),
);

const sourceSpecObjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("github"), repo: z.string().min(1) }),
  z.object({ kind: z.literal("git"), url: z.string().min(1) }),
  z.object({ kind: z.literal("path"), location: z.string().min(1) }),
]);

const sourceSpecSchema = z
  .unknown()
  .transform((raw, ctx) => {
    if (typeof raw !== "string") return raw;
    if (raw.startsWith("github:"))
      return { kind: "github" as const, repo: raw.slice("github:".length) };
    if (raw.startsWith("git:")) return { kind: "git" as const, url: raw.slice("git:".length) };
    if (raw.startsWith("path:"))
      return { kind: "path" as const, location: raw.slice("path:".length) };
    ctx.addIssue({ code: "custom", message: `unknown source scheme: ${raw}` });
    return z.NEVER;
  })
  .pipe(sourceSpecObjectSchema);

export const capabilitiesYmlSchema = z.object({
  acf: z.literal(1),
  capabilities: z.array(
    z
      .object({
        source: sourceSpecSchema,
        ref: z.string().optional(),
        path: z.string().optional(),
        include: selectorSchema.optional(),
        exclude: selectorSchema.optional(),
        rename: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
        only: z.array(targetIdSchema).optional(),
        except: z.array(targetIdSchema).optional(),
      })
      .and(onlyExceptSchema),
  ),
  defaults: z
    .object({
      fetch: z
        .object({ shallow: z.boolean().optional(), blobless: z.boolean().optional() })
        .optional(),
    })
    .optional(),
});

export const capabilitiesLockSchema = z.object({
  acf: z.literal(1),
  entries: z.array(
    z.object({
      sourceId: z.string(),
      commit: z.string(),
      contentHash: z.string().regex(/^sha256-[a-f0-9]{64}$/),
      installedAt: z.string(),
      capabilityName: slugSchema,
    }),
  ),
});

const skillsEmitOptionsSchema = z.object({
  native: z.boolean().optional(),
  canonical: z.boolean().optional(),
});

export const capletConfigSchema = z.object({
  emit: z
    .object({
      scope: z.enum(["all", "user", "project"]).optional(),
      defaultTargets: z.array(z.string()).optional(),
      cleanBeforeEmit: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    })
    .optional(),
  targets: z
    .record(
      z.string(),
      z.object({
        out: z.object({ user: z.string().optional(), project: z.string().optional() }).optional(),
        disabled: z.boolean().optional(),
        skills: skillsEmitOptionsSchema.optional(),
      }),
    )
    .optional(),
  auth: z
    .object({
      github: z
        .object({ kind: z.enum(["gh", "token", "ssh"]), token: z.string().optional() })
        .optional(),
    })
    .optional(),
  resolver: z
    .object({
      cacheDir: z.string().optional(),
      retries: z.number().int().nonnegative().optional(),
      shallow: z.boolean().optional(),
      blobless: z.boolean().optional(),
    })
    .optional(),
  diagnostics: z
    .object({
      showInfo: z.boolean().optional(),
      showLossy: z.boolean().optional(),
      failOnLossy: z.boolean().optional(),
    })
    .optional(),
});

export type ManifestInput = z.infer<typeof manifestSchema>;
