import { homedir } from "node:os";
import path from "node:path";
import { pushZodIssues } from "../diagnostics/index.js";
import { capletConfigSchema } from "../schemas/index.js";
import type { CapletConfig, Diagnostic } from "../types/index.js";
import { exists, readText } from "../utils/fs.js";
import { parseYaml } from "../yaml.js";

export { capletConfigSchema } from "../schemas/index.js";
export type { CapletConfig } from "../types/index.js";

export const capletConfigLocations = [
  path.join(homedir(), ".agents", "caplet.yml"),
  path.join(".", ".agents", "caplet.yml"),
] as const;

export async function readCapletConfig(
  cwd = ".",
): Promise<{ config: CapletConfig; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const user = await readConfigFile(capletConfigLocations[0], diagnostics);
  const project = await readConfigFile(path.resolve(cwd, ".agents", "caplet.yml"), diagnostics);
  return { config: mergeCapletConfig(user, project), diagnostics };
}

export function mergeCapletConfig(
  base: CapletConfig = {},
  override: CapletConfig = {},
): CapletConfig {
  const merged: CapletConfig = deepMerge(base, override) as CapletConfig;
  return merged;
}

async function readConfigFile(file: string, diagnostics: Diagnostic[]): Promise<CapletConfig> {
  if (!(await exists(file))) return {};
  try {
    const raw = parseYaml(await readText(file));
    const parsed = capletConfigSchema.safeParse(raw);
    if (!parsed.success) {
      pushZodIssues(diagnostics, parsed.error, file);
      return {};
    }
    return parsed.data;
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "acf.schema.invalid-yaml",
      message: error instanceof Error ? error.message : "invalid YAML",
      path: file,
    });
    return {};
  }
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = key in out ? deepMerge(out[key], value) : value;
    }
    return out;
  }
  return override ?? base;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
