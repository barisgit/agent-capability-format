import path from "node:path";
import matter from "gray-matter";
import { type ApplicabilityDecl, computeSet } from "../applicability/index.js";
import { isTargetId } from "../targets/registry.js";
import type { AcfCapability, Diagnostic, FacetFamily, Manifest, TargetId } from "../types/index.js";
import { exists, readText } from "../utils/fs.js";
import { isRecord } from "../utils/guards.js";
import { assertNoProtoKey } from "../utils/proto-key.js";
import { parseYaml } from "../yaml.js";

/** The file diagnostics on the manifest name: the one read, else where `acf.yml` would be. */
export function manifestFile(cap: AcfCapability): string {
  return cap.manifestPath ?? path.join(cap.root, "acf.yml");
}

export async function pickFamilyYaml(
  dir: string,
  base: string,
  duplicateCode: string,
  diagnostics: Diagnostic[],
): Promise<string | undefined> {
  const yml = path.join(dir, `${base}.yml`);
  const yaml = path.join(dir, `${base}.yaml`);
  const hasYml = await exists(yml);
  const hasYaml = await exists(yaml);
  if (hasYml && hasYaml) {
    diagnostics.push({
      severity: "error",
      code: duplicateCode,
      message: `${base}.yml and ${base}.yaml both exist`,
      path: dir,
    });
  }
  if (hasYml) return yml;
  if (hasYaml) return yaml;
  return undefined;
}

export async function validateSingularFolders(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  for (const name of ["skill", "agent", "command", "instruction", "hook", "mcps"]) {
    const full = path.join(root, name);
    if (await exists(full)) {
      diagnostics.push({
        severity: "error",
        code: "acf.layout.singular-facet-folder",
        message: `singular facet folder is not canonical: ${name}`,
        path: full,
      });
    }
  }
}

/** Splits `file` into frontmatter and body; throws on malformed YAML or a `__proto__` key. */
export async function parseMarkdown(
  file: string,
): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  // Passing options bypasses gray-matter's content cache, which keeps an entry even when parsing
  // throws: a second file with the same broken text would read back as empty frontmatter.
  const parsed = matter(await readText(file), {});
  assertNoProtoKey(parsed.data);
  return { frontmatter: parsed.data, body: parsed.content };
}

/**
 * {@link parseMarkdown}, with a frontmatter parse error reported as `acf.schema.invalid-yaml`
 * and `undefined` returned, so one broken file does not abort the capability read.
 */
export async function parseMarkdownFile(
  file: string,
  diagnostics: Diagnostic[],
): Promise<{ frontmatter: Record<string, unknown>; body: string } | undefined> {
  try {
    return await parseMarkdown(file);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "acf.schema.invalid-yaml",
      message: error instanceof Error ? error.message : "invalid frontmatter YAML",
      path: file,
    });
    return undefined;
  }
}

export async function parseYamlFile(file: string, diagnostics: Diagnostic[]): Promise<unknown> {
  try {
    return parseYaml(await readText(file));
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "acf.schema.invalid-yaml",
      message: error instanceof Error ? error.message : "invalid YAML",
      path: file,
    });
    return undefined;
  }
}

export function validateNameMatch(
  family: FacetFamily,
  name: string,
  discovered: string,
  file: string,
  diagnostics: Diagnostic[],
): void {
  if (name !== discovered) {
    diagnostics.push({
      severity: "error",
      code: "acf.facet.name-mismatch",
      message: `frontmatter name ${name} must match discovered id ${discovered}`,
      path: file,
      family,
    });
  }
}

export function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

export function counts(values: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

export function pushUnknownFields(
  data: unknown,
  allowed: Set<string>,
  diagnostics: Diagnostic[],
  file: string,
): void {
  if (!isRecord(data)) return;
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      diagnostics.push({
        severity: "info",
        code: "acf.markdown.unknown-frontmatter-field",
        message: `unknown field: ${key}`,
        path: file,
        data: { field: key },
      });
    }
  }
}

export function collectUnknown(
  data: Record<string, unknown>,
  allowed: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) if (!allowed.has(key)) out[key] = value;
  return out;
}

/**
 * An entry of a family-level `targets.<target>` block (hooks, MCP servers), applying to `target`
 * only: its own `only`/`except` narrows it, so its applicability becomes their intersection with
 * `[target]`, possibly empty. The entry's own ids do not survive into the model, so unknown ones
 * are passed to `reportUnknownId` here.
 */
export function narrowToTarget<Entry extends ApplicabilityDecl>(
  { only, except, ...entry }: Entry,
  target: TargetId,
  reportUnknownId: (id: string) => void,
): Omit<Entry, "only" | "except"> & { only: TargetId[] } {
  for (const id of [...(only ?? []), ...(except ?? [])]) if (!isTargetId(id)) reportUnknownId(id);
  return { ...entry, only: computeSet({ only, except }, [target]) };
}

export function fallbackManifest(root: string): Manifest {
  return {
    acf: 1,
    name:
      path
        .basename(root)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "") || "invalid",
    version: "0.0.0",
  };
}

export function sortDiagnostics(diagnostics: Diagnostic[]): void {
  diagnostics.sort(
    (a, b) => (a.path ?? "").localeCompare(b.path ?? "") || a.code.localeCompare(b.code),
  );
}
