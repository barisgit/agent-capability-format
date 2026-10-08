/**
 * Skill projection shared by the foreign format readers. Canonical keys become core
 * frontmatter; every other key stays in the source dialect's native extras on the skill
 * (canonical-skills, Skill field mapping).
 */
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { type ExtrasDialect, withNativeExtras } from "../extras/index.js";
import { parseMarkdown } from "../reader/helpers.js";
import type { AssetRef, Diagnostic, SkillFacet } from "../types/index.js";
import { filesUnder, isFile, isRecord, isSlug } from "./shared.js";

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
  take("disable-model-invocation", typeof raw["disable-model-invocation"] === "boolean", () => {
    if (raw["disable-model-invocation"] === true)
      frontmatter.invocation = { ...frontmatter.invocation, model: false };
  });
  take("user-invocable", typeof raw["user-invocable"] === "boolean", () => {
    if (raw["user-invocable"] === false)
      frontmatter.invocation = { ...frontmatter.invocation, user: false };
  });
  return withExtras(frontmatter, raw, consumed, "claude");
}

function withExtras(
  frontmatter: Frontmatter,
  raw: Record<string, unknown>,
  consumed: ReadonlySet<string>,
  dialect: ExtrasDialect,
): Frontmatter {
  const extras = Object.fromEntries(Object.entries(raw).filter(([key]) => !consumed.has(key)));
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

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
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
