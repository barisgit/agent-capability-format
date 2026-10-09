import { readdir } from "node:fs/promises";
import path from "node:path";
import { pushZodIssues } from "../diagnostics/index.js";
import { AGENT_PLUGINS_DIALECT, withNativeExtras } from "../extras/index.js";
import { componentNotLoaded, nativeValuesProblem } from "../formats/shared.js";
import { mapBareSkill } from "../formats/skills.js";
import { skillFrontmatterSchema } from "../schemas/index.js";
import { nativeKeyInfo } from "../targets/native-keys.js";
import { targetIds } from "../targets/registry.js";
import type { Diagnostic, SkillFacet } from "../types/index.js";
import { exists } from "../utils/fs.js";
import { byName, parseMarkdownFile, pushUnknownFields, validateNameMatch } from "./helpers.js";

/** Skill frontmatter keys that are core ACF fields. */
const coreSkillKeys: ReadonlySet<string> = new Set([
  "name",
  "description",
  "invocation",
  "assets",
  "only",
  "except",
  "targets",
  "license",
  "compatibility",
  "metadata",
  "argument-hint",
  "allowed-tools",
]);

/**
 * Reads the `skills/<name>/SKILL.md` facets, sorted by name. In an `imported` tree (one carrying
 * `.acf-import.json`) a bare skill's foreign keys become core fields or native extras and a
 * missing description gets an in-memory fallback; in an authored tree they are reported.
 */
export async function readSkills(
  root: string,
  diagnostics: Diagnostic[],
  imported = false,
): Promise<SkillFacet[]> {
  const dir = path.join(root, "skills");
  if (!(await exists(dir))) return [];
  const facets: SkillFacet[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) {
      diagnostics.push({
        severity: "error",
        code: "acf.skill.shape.not-directory",
        message: `skills/${entry.name} must be a directory`,
        path: full,
      });
      continue;
    }
    const facet = await readSkill(full, entry.name, imported, diagnostics);
    if (facet !== undefined) facets.push(facet);
  }
  return facets.sort(byName);
}

/**
 * The skill in directory `full` named `dirName`, or undefined after reporting why it is not. An
 * imported skill whose native value is outside its host's domain is left out with the warning
 * every foreign source uses (design D27.4); in an authored skill the same value is an error.
 */
async function readSkill(
  full: string,
  dirName: string,
  imported: boolean,
  diagnostics: Diagnostic[],
): Promise<SkillFacet | undefined> {
  const primary = path.join(full, "SKILL.md");
  if (!(await exists(primary))) {
    diagnostics.push({
      severity: "error",
      code: "acf.facet.primary-missing",
      message: `skills/${dirName}/ must contain SKILL.md`,
      path: full,
      family: "skill",
    });
    return undefined;
  }
  const parsed = await parseMarkdownFile(primary, diagnostics);
  if (parsed === undefined) return undefined;
  const { frontmatter, extras } = skillFrontmatter(
    parsed.frontmatter,
    primary,
    imported,
    diagnostics,
  );
  const result = skillFrontmatterSchema.safeParse(frontmatter);
  if (!result.success) {
    pushZodIssues(diagnostics, result.error, primary, {
      baseCode: "acf.markdown.invalid-frontmatter-field",
      family: "skill",
    });
    return undefined;
  }
  if (imported) {
    for (const [dialect, dialectExtras] of extras) {
      if (dialect === AGENT_PLUGINS_DIALECT) continue;
      const problem = nativeValuesProblem(dialect, "skill", dialectExtras);
      if (problem === undefined) continue;
      diagnostics.push(componentNotLoaded("skill", dirName, problem, primary));
      return undefined;
    }
  }
  const facet: SkillFacet = {
    family: "skill",
    name: result.data.name,
    dir: full,
    primaryFile: primary,
    frontmatter: result.data,
    body: parsed.body,
  };
  for (const [dialect, dialectExtras] of extras) {
    facet.frontmatter.targets = withNativeExtras(facet.frontmatter.targets, dialect, dialectExtras);
  }
  validateNameMatch(facet.family, facet.name, dirName, primary, diagnostics);
  return facet;
}

/** Native extras of an imported skill, by dialect. */
type DialectExtras = NonNullable<ReturnType<typeof mapBareSkill>>["extras"];

/**
 * The frontmatter to validate as core, and the native extras by dialect. A bare imported skill
 * keeps every key as core, a target's extra or an agent-plugins extra, and a missing description
 * gets a fallback; an authored skill reports native and unknown keys.
 */
function skillFrontmatter(
  raw: Record<string, unknown>,
  primary: string,
  imported: boolean,
  diagnostics: Diagnostic[],
): {
  frontmatter: Record<string, unknown>;
  extras: DialectExtras;
} {
  const mapped = imported ? mapBareSkill(raw, coreSkillKeys) : undefined;
  if (mapped === undefined) {
    const reported = rejectNativeSkillKeys(raw, primary, diagnostics);
    pushUnknownFields(raw, new Set([...coreSkillKeys, ...reported]), diagnostics, primary);
  }
  const candidate = mapped?.core ?? raw;
  const extras: DialectExtras = mapped?.extras ?? new Map();
  if (!imported || (typeof candidate.description === "string" && candidate.description.length > 0))
    return { frontmatter: candidate, extras };
  diagnostics.push({
    severity: "warn",
    code: "acf.import.skill-description-missing",
    message: "imported skill has no description; using an in-memory fallback",
    path: primary,
    family: "skill",
  });
  return { frontmatter: { ...candidate, description: "Imported skill" }, extras };
}

/**
 * Reports the top-level keys of an authored skill that are a target's native skill keys rather
 * than core fields, and returns them so they are not reported again as unknown. A key a writer
 * generates from a core field (`disable-model-invocation`) names that field. Any other key
 * names its `targets.<t>.native` spelling for every target that knows it: an error when
 * dropping it would change behavior, a warning for a descriptive key. Path-scoped activation
 * keeps its own code (canonical-skills, Path-scoped activation stays per target). A key no
 * target knows is left to the unknown-field report.
 */
function rejectNativeSkillKeys(
  frontmatter: Record<string, unknown>,
  file: string,
  diagnostics: Diagnostic[],
): string[] {
  const reported: string[] = [];
  for (const key of Object.keys(frontmatter)) {
    if (coreSkillKeys.has(key)) continue;
    const known = targetIds.flatMap((target) => nativeKeyInfo(target, "skill", key) ?? []);
    if (known.length === 0) continue;
    reported.push(key);
    const perTarget = known.map((info) => `targets.${info.target}.native.${key}`);
    const coreField = known.find((info) => info.generatedFrom !== undefined)?.generatedFrom;
    const base = { path: file, family: "skill" as const, data: { field: key } };
    if (key === "paths") {
      diagnostics.push({
        ...base,
        severity: "error",
        code: "acf.skill.paths-not-core",
        message:
          "paths is not a core skill field: glob dialects and activation scope differ between " +
          `tools. Declare it per target as ${perTarget.join(" or ")}`,
      });
    } else if (coreField !== undefined) {
      diagnostics.push({
        ...base,
        severity: "error",
        code: "acf.skill.native-key-not-core",
        message: `${key} is a native skill key, not an ACF field; write its core equivalent ${coreFieldSpelling(coreField)}`,
      });
    } else {
      diagnostics.push({
        ...base,
        severity: known.every((info) => info.class === "descriptive") ? "warn" : "error",
        code: "acf.skill.native-key-not-core",
        message: `${key} is a native skill key, not an ACF field; declare it per target as ${perTarget.join(" or ")}`,
      });
    }
  }
  return reported;
}

/** A registry field id such as `skill.invocation.model=false` as frontmatter: `invocation.model: false`. */
function coreFieldSpelling(field: string): string {
  const [fieldPath = field, value] = field.replace(/^skill\./, "").split("=");
  return value === undefined ? fieldPath : `${fieldPath}: ${value}`;
}
