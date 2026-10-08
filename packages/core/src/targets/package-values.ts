/**
 * Value schemas for per-target package values (`targets.<target>.package`; canonical-package-
 * metadata, Per-target package values). A target accepts exactly the manifest keys its writer
 * generates from package metadata, except `name`, validated in the target's own value domain
 * rather than the core one (a Claude `version` need not be SemVer).
 */
import { z } from "zod";
import type { TargetId } from "../types/model.js";

const claudeAuthor = z.looseObject({
  name: z.string().min(1),
  email: z.string().optional(),
  url: z.string().optional(),
});

/** Per target, the settable manifest keys and their native value schema. */
export const packageValueSchemas: Readonly<Record<TargetId, Readonly<Record<string, z.ZodType>>>> =
  {
    // claude-code.md, Plugin layout and manifest.
    claude: {
      version: z.string().min(1),
      description: z.string(),
      author: claudeAuthor,
      license: z.string(),
      homepage: z.string(),
      repository: z.string(),
      keywords: z.array(z.string()),
    },
  };

/** Why `value` is not a valid package value for `key` on `target`, or undefined when it is. */
export function packageValueProblem(
  target: TargetId,
  key: string,
  value: unknown,
): string | undefined {
  if (key === "name") return "name cannot be set per target; the capability slug is its identity";
  const schemas = packageValueSchemas[target];
  if (schemas === undefined) return `${target} generates no package manifest from metadata`;
  const schema = schemas[key];
  if (schema === undefined) {
    return `${target} generates no manifest key ${key} from package metadata; settable keys: ${Object.keys(schemas).join(", ")}`;
  }
  const result = schema.safeParse(value);
  return result.success
    ? undefined
    : `invalid ${target} ${key}: ${result.error.issues[0]?.message ?? "invalid value"}`;
}
