/**
 * Skill projection shared by the foreign format readers. Canonical keys become core
 * frontmatter; every other key stays in the source dialect's native extras on the skill
 * (canonical-skills, Skill field mapping).
 */
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { AGENT_PLUGINS_DIALECT, type ExtrasDialect, withNativeExtras } from "../extras/index.js";
import { parseMarkdown } from "../reader/helpers.js";
import { nativeKeyInfo } from "../targets/native-keys.js";
import { targetIds } from "../targets/registry.js";
import type { AssetRef, Diagnostic, SkillFacet } from "../types/index.js";
import { isRecord, isSlug, isStringMap } from "../utils/guards.js";
import { filesUnder, isFile, nativeValuesProblem } from "./shared.js";

/** Which loading rules apply: Agent Skills as Agent Plugins 1.0 requires, or Claude's. */
export type SkillRules = "agent-plugins" | "claude";

type Frontmatter = SkillFacet["frontmatter"];

/**
 * Reads `<dir>/SKILL.md`. An invalid skill yields undefined and an
 * `acf.source.component-invalid` warning, so the rest of the package still loads.
 */
export async function readForeignSkill(
  dir: string,
  rules: SkillRules,
  diagnostics: Diagnostic[],
): Promise<SkillFacet | undefined> {
  const primaryFile = path.join(dir, "SKILL.md");
  const invalid = (reason: string): undefined => {
    diagnostics.push({
      severity: "warn",
      code: "acf.source.component-invalid",
      message: `skill ${path.basename(dir)} is not loaded: ${reason}`,
      path: primaryFile,
      family: "skill",
    });
    return undefined;
  };

  let parsed: { frontmatter: Record<string, unknown>; body: string };
  try {
    parsed = await parseMarkdown(primaryFile);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }
  const projected =
    rules === "agent-plugins"
      ? projectAgentSkill(parsed.frontmatter, path.basename(dir))
      : projectClaudeSkill(parsed.frontmatter, parsed.body, path.basename(dir));
  if (typeof projected === "string") return invalid(projected);
  return {
    family: "skill",
    name: projected.name,
    dir,
    primaryFile,
    frontmatter: projected,
    body: parsed.body,
  };
}

const AGENT_SKILL_KEYS = new Set(["name", "description", "license", "compatibility", "metadata"]);

/** Agent Skills frontmatter: a closed set of checked keys; the rest are dialect extras. */
function projectAgentSkill(raw: Record<string, unknown>, dirName: string): Frontmatter | string {
  const { name, description, license, compatibility, metadata } = raw;
  if (typeof name !== "string" || !isSlug(name)) return "name must be a lowercase slug";
  if (name !== dirName) return `name ${name} does not match its directory ${dirName}`;
  if (typeof description !== "string" || description.length === 0 || description.length > 1024)
    return "description must be 1-1024 characters";
  if (license !== undefined && typeof license !== "string") return "license must be a string";
  if (
    compatibility !== undefined &&
    (typeof compatibility !== "string" || compatibility.length > 500)
  )
    return "compatibility must be a string of at most 500 characters";
  if (metadata !== undefined && !isStringMap(metadata))
    return "metadata must map strings to strings";

  const frontmatter: Frontmatter = { name, description };
  if (license !== undefined) frontmatter.license = license;
  if (compatibility !== undefined) frontmatter.compatibility = compatibility;
  if (metadata !== undefined) frontmatter.metadata = metadata;
  return withExtras(frontmatter, raw, AGENT_SKILL_KEYS, "agent-plugins");
}

/**
 * Claude skill frontmatter. Claude defaults `name` to the directory and `description` to
 * the first non-empty body line; values outside the canonical domain stay Claude extras.
 */
function projectClaudeSkill(
  raw: Record<string, unknown>,
  body: string,
  dirName: string,
): Frontmatter | string {
  const name = raw.name ?? dirName;
  if (typeof name !== "string" || !isSlug(name)) return "name must be a lowercase slug";
  const description =
    typeof raw.description === "string" && raw.description.length > 0
      ? raw.description
      : firstLine(body);
  if (description === undefined) return "no description and no body line to use as one";

  const frontmatter: Frontmatter = { name, description };
  const consumed = new Set(["name", "description"]);
  const take = (key: string, ok: boolean, apply: () => void): void => {
    if (raw[key] === undefined || !ok) return;
    apply();
    consumed.add(key);
  };
  take("license", typeof raw.license === "string", () => {
    frontmatter.license = raw.license as string;
  });
  take("compatibility", typeof raw.compatibility === "string", () => {
    frontmatter.compatibility = raw.compatibility as string;
  });
  take("metadata", isStringMap(raw.metadata), () => {
    frontmatter.metadata = raw.metadata as Record<string, string>;
  });
  take("argument-hint", typeof raw["argument-hint"] === "string", () => {
    frontmatter["argument-hint"] = raw["argument-hint"] as string;
  });
  const invocation = claudeInvocation(raw);
  for (const key of invocation.consumed) consumed.add(key);
  if (Object.keys(invocation.restrictions).length > 0)
    frontmatter.invocation = { ...frontmatter.invocation, ...invocation.restrictions };
  return withExtras(frontmatter, raw, consumed, "claude");
}

/** Claude's boolean invocation keys, the core field each sets and the value that restricts. */
const CLAUDE_INVOCATION_KEYS = [
  ["disable-model-invocation", "model", true],
  ["user-invocable", "user", false],
] as const;

/**
 * Claude's invocation keys as core `invocation` restrictions: `disable-model-invocation: true`
 * is `model: false` and `user-invocable: false` is `user: false`; the other boolean is the
 * default. A non-boolean value is not consumed, so the caller keeps it as an extra.
 */
function claudeInvocation(raw: Record<string, unknown>): {
  consumed: string[];
  restrictions: { model?: false; user?: false };
} {
  const consumed: string[] = [];
  const restrictions: { model?: false; user?: false } = {};
  for (const [key, field, restricting] of CLAUDE_INVOCATION_KEYS) {
    if (typeof raw[key] !== "boolean") continue;
    consumed.push(key);
    if (raw[key] === restricting) restrictions[field] = false;
  }
  return { consumed, restrictions };
}

/**
 * Maps bare skill frontmatter (a skills directory imported without a package manifest; SPEC.md
 * §20.3) the way the format readers map theirs, so no key, and in particular no restricting
 * key, is lost (design D4, D5). `coreKeys` stay as written for the caller's schema check;
 * Claude's boolean invocation keys become `invocation` restrictions; a key a target's registry
 * classifies becomes the extra of the first such target in registry order (Claude first, so a
 * key Claude and Cursor share, such as `paths`, stays one dialect's key and is not copied into a
 * second tool's field); any other key becomes an `agent-plugins` extra. Returns the core
 * candidate and the extras per dialect, to attach after the schema check.
 */
export function mapBareSkill(
  raw: Record<string, unknown>,
  coreKeys: ReadonlySet<string>,
): { core: Record<string, unknown>; extras: Map<ExtrasDialect, Record<string, unknown>> } {
  const core = Object.fromEntries(Object.entries(raw).filter(([key]) => coreKeys.has(key)));
  const invocation = claudeInvocation(raw);
  if (Object.keys(invocation.restrictions).length > 0) {
    // A malformed authored `invocation` is left for the schema check to report.
    if (core.invocation === undefined || isRecord(core.invocation))
      core.invocation = { ...core.invocation, ...invocation.restrictions };
  }
  const consumed = new Set([...coreKeys, ...invocation.consumed]);
  const extras = new Map<ExtrasDialect, Record<string, unknown>>();
  const keep = (dialect: ExtrasDialect, key: string, value: unknown): void => {
    extras.set(dialect, { ...extras.get(dialect), [key]: value });
  };
  for (const [key, value] of Object.entries(raw)) {
    if (consumed.has(key)) continue;
    const owner = targetIds.find((target) => nativeKeyInfo(target, "skill", key) !== undefined);
    keep(owner ?? AGENT_PLUGINS_DIALECT, key, value);
  }
  return { core, extras };
}

function withExtras(
  frontmatter: Frontmatter,
  raw: Record<string, unknown>,
  consumed: ReadonlySet<string>,
  dialect: ExtrasDialect,
): Frontmatter | string {
  const extras = Object.fromEntries(Object.entries(raw).filter(([key]) => !consumed.has(key)));
  if (dialect !== AGENT_PLUGINS_DIALECT) {
    const problem = nativeValuesProblem(dialect, "skill", extras);
    if (problem !== undefined) return problem;
  }
  if (Object.keys(extras).length > 0)
    frontmatter.targets = withNativeExtras(frontmatter.targets, dialect, extras);
  return frontmatter;
}

function firstLine(body: string): string | undefined {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

/** Skill directories `<dir>/<name>/SKILL.md` directly below `dir`, sorted. */
export async function skillDirectories(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(dir, entry.name);
    if (entry.isDirectory() && (await isFile(path.join(candidate, "SKILL.md"))))
      out.push(candidate);
  }
  return out.sort();
}

/**
 * Every file of each skill directory except `SKILL.md`, as implicit assets relative to the
 * package root, so emitters copy skill resources with the skill.
 */
export async function skillAssets(root: string, skills: SkillFacet[]): Promise<AssetRef[]> {
  const assets: AssetRef[] = [];
  for (const skill of skills) {
    const primary = path.relative(root, skill.primaryFile).split(path.sep).join("/");
    for (const file of await filesUnder(root, skill.dir)) {
      if (file === primary) continue;
      assets.push({ path: file, origin: "implicit", facet: { family: "skill", name: skill.name } });
    }
  }
  return assets.sort((a, b) => a.path.localeCompare(b.path));
}
