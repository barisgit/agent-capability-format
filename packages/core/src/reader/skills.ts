import { readdir } from "node:fs/promises";
import path from "node:path";
import { pushZodIssues } from "../diagnostics/index.js";
import { withNativeExtras } from "../extras/index.js";
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
    const primary = path.join(full, "SKILL.md");
    if (!(await exists(primary))) {
      diagnostics.push({
        severity: "error",
        code: "acf.facet.primary-missing",
        message: `skills/${entry.name}/ must contain SKILL.md`,
        path: full,
        family: "skill",
      });
      continue;
    }
    const parsed = await parseMarkdownFile(primary, diagnostics);
    if (parsed === undefined) continue;
    // A bare imported skill keeps every key as core, a target's extra or an agent-plugins
    // extra; an authored skill reports unknown keys.
    const mapped = imported ? mapBareSkill(parsed.frontmatter, coreSkillKeys) : undefined;
    if (mapped === undefined) {
      const reported = rejectNativeSkillKeys(parsed.frontmatter, primary, diagnostics);
      pushUnknownFields(
        parsed.frontmatter,
        new Set([...coreSkillKeys, ...reported]),
        diagnostics,
        primary,
      );
    }
    const candidate = mapped?.core ?? parsed.frontmatter;
    const missingDescription =
      imported && (typeof candidate.description !== "string" || candidate.description.length === 0);
    const frontmatter = missingDescription
      ? { ...candidate, description: "Imported skill" }
      : candidate;
    if (missingDescription) {
      diagnostics.push({
        severity: "warn",
        code: "acf.import.skill-description-missing",
        message: "imported skill has no description; using an in-memory fallback",
        path: primary,
        family: "skill",
      });
    }
    const result = skillFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      pushZodIssues(diagnostics, result.error, primary, {
        baseCode: "acf.markdown.invalid-frontmatter-field",
        family: "skill",
      });
      continue;
    }
    const facet: SkillFacet = {
      family: "skill",
      name: result.data.name,
      dir: full,
      primaryFile: primary,
      frontmatter: result.data,
      body: parsed.body,
    };
    for (const [dialect, extras] of mapped?.extras ?? []) {
      facet.frontmatter.targets = withNativeExtras(facet.frontmatter.targets, dialect, extras);
    }
    validateNameMatch(facet.family, facet.name, entry.name, primary, diagnostics);
    facets.push(facet);
  }
  return facets.sort(byName);
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
