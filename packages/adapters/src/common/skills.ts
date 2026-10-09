import { homedir } from "node:os";
import path from "node:path";
import {
  type AcfCapability,
  applicableTargets,
  capabilityBlocked,
  componentOmitted,
  type Diagnostic,
  type EmitInput,
  type FileDiff,
  MANAGEMENT_NOTICE_FILENAME,
  type ReadOnlyFs,
  remainderSupport,
  renderArtifactNotice,
  type Scope,
  type SkillFacet,
  type TargetDefinition,
  type TargetId,
} from "@caplet/core";
import { type AssetPayload, readAssets, relativeAssetPathFromBase } from "./assets.js";
import { makeFileDiff } from "./diff.js";
import { mcpSupport } from "./mcp.js";
import { ownValue, setOwn } from "./records.js";
import { type NativeSkill, renderNativeSkill } from "./skill-serializer.js";
import type { EmitReport } from "./support-report.js";
import { renderMarkdownFile } from "./text.js";

/** One skill directory to write: its root and the rendering. */
type SkillCopy = { root: string; rendering: NativeSkill };

/**
 * Emits the capability's skills for one target. A target that discovers the shared
 * `.agents/skills` root writes its skills there when one rendering satisfies every selected
 * reader of that root (`options.canonicalSkillReaders`); otherwise, and for targets that do not
 * discover it, skills go to the target's native skill root. `options.skills` overrides both
 * defaults. Refused skills are not written anywhere for the target, and no skill goes to the
 * shared root while a refusal blocks the capability for one of its readers.
 */
export async function emitSkills(
  input: EmitInput,
  fs: ReadOnlyFs,
  target: TargetDefinition,
  report: EmitReport,
): Promise<FileDiff[]> {
  const cap = input.capability;
  const diffs: FileDiff[] = [];
  const emittedPaths = new Set<string>();
  const readers = sharedRootReaders(input, target);
  // A reader blocked by any refusal writes nothing of the capability, so a shared copy would
  // still reach it through discovery; every discovering target then uses its native root.
  const sharedReaders = readers.some((reader) => blocksCapability(cap, reader)) ? null : readers;

  for (const skill of [...cap.skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const copies = renderedCopies(input, target, skill, sharedReaders, report);
    if (copies.length === 0) continue;
    const assets = await readSkillAssets(cap, skill, fs);
    for (const copy of copies) {
      await pushSkillCopy(diffs, emittedPaths, fs, cap, skill, copy, assets, report.diagnostics);
    }
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

function renderedCopies(
  input: EmitInput,
  target: TargetDefinition,
  skill: SkillFacet,
  readers: readonly TargetId[] | null,
  report: EmitReport,
): SkillCopy[] {
  const own = renderNativeSkill(input.capability, skill, target.id);
  report.diagnostics.push(...own.diagnostics);
  report.outcomes.push(...own.outcomes);
  if (own.refused) return [];

  const discovers = target.discoversCanonicalSkills === true;
  const writeShared = input.options.skills?.canonical ?? discovers;
  const shared =
    writeShared && readers !== null
      ? readers.length === 0
        ? own
        : sharedRendering(input.capability, skill, readers)
      : null;
  // A discovering target relies on the shared copy; when none can be written it falls back to
  // its native root, which other readers of the shared root do not discover.
  const fallback = discovers && writeShared && shared === null;
  const writeNative = input.options.skills?.native ?? (!discovers || fallback);

  const copies: SkillCopy[] = [];
  if (shared !== null) copies.push({ root: skillsRootForScope(input.scope), rendering: shared });
  const nativeRoot = target.skillInstallPaths?.[input.scope] ?? null;
  if (writeNative && nativeRoot !== null) copies.push({ root: nativeRoot, rendering: own });
  else if (fallback) {
    report.diagnostics.push(
      componentOmitted(
        {
          capability: input.capability.manifest.name,
          target: target.id,
          family: "skill",
          component: skill.name,
        },
        `the shared .agents/skills copy cannot serve every selected target and ${target.id} has no native skill root`,
      ),
    );
  }
  return copies;
}

/** Selected readers of the shared root, sorted so every writer renders the same copy. */
function sharedRootReaders(input: EmitInput, target: TargetDefinition): TargetId[] {
  const readers = new Set(
    input.options.canonicalSkillReaders ?? (target.discoversCanonicalSkills ? [target.id] : []),
  );
  if (target.discoversCanonicalSkills) readers.add(target.id);
  return [...readers].sort((a, b) => a.localeCompare(b));
}

/**
 * The one rendering of `skill` for the shared root that every reader accepts, or null when
 * there is none: a reader excludes the skill, the readers' own extras differ (an extra in a
 * shared file counts as emitted to every reader), or two renderings disagree on a key. The
 * caller has ruled out readers blocked by a refusal, this skill's included. Core translations of different readers are merged, since each states the same meaning.
 */
function sharedRendering(
  cap: AcfCapability,
  skill: SkillFacet,
  readers: readonly TargetId[],
): NativeSkill | null {
  const applicable = applicableTargets(cap, skill.frontmatter);
  if (!readers.every((reader) => applicable.includes(reader))) return null;
  const renderings = readers.map((reader) => renderNativeSkill(cap, skill, reader));
  const extras = new Set(renderings.map((rendering) => stableJson(rendering.extras)));
  if (extras.size > 1) return null;

  const merged: NativeSkill = {
    frontmatter: {},
    files: {},
    extras: renderings[0]?.extras ?? {},
    diagnostics: [],
    outcomes: [],
    refused: false,
  };
  for (const rendering of renderings) {
    if (!mergeInto(merged.frontmatter, rendering.frontmatter)) return null;
    if (!mergeInto(merged.files, rendering.files)) return null;
  }
  return merged;
}

/**
 * True when a refusal blocks the whole capability for `reader` on the loose carrier: one from its
 * native remainder, or from a skill or MCP server that applies to `reader`.
 */
function blocksCapability(cap: AcfCapability, reader: TargetId): boolean {
  const skills = cap.skills
    .filter((skill) => applicableTargets(cap, skill.frontmatter).includes(reader))
    .flatMap((skill) => renderNativeSkill(cap, skill, reader).diagnostics);
  const support = [...remainderSupport(cap, reader), ...skills, ...mcpSupport(cap, reader)];
  return capabilityBlocked(support, reader);
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(source)) {
    if (Object.hasOwn(target, key) && stableJson(ownValue(target, key)) !== stableJson(value))
      return false;
    setOwn(target, key, value);
  }
  return true;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

async function pushSkillCopy(
  diffs: FileDiff[],
  emittedPaths: Set<string>,
  fs: ReadOnlyFs,
  cap: AcfCapability,
  skill: SkillFacet,
  copy: SkillCopy,
  assets: AssetPayload[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const skillRoot = path.join(copy.root, skill.name);
  const facet = { family: "skill" as const, name: skill.name };
  const metadata = { artifactRoot: skillRoot, facet };
  const skillPath = path.join(skillRoot, "SKILL.md");
  const { frontmatter, files } = copy.rendering;
  await pushTextDiff(
    diffs,
    emittedPaths,
    fs,
    skillPath,
    renderMarkdownFile(frontmatter, skill.body),
    metadata,
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const outPath = path.join(skillRoot, ...relativePath.split("/"));
    await pushTextDiff(diffs, emittedPaths, fs, outPath, content, metadata);
  }

  await pushTextDiff(
    diffs,
    emittedPaths,
    fs,
    path.join(skillRoot, MANAGEMENT_NOTICE_FILENAME),
    renderArtifactNotice(cap.manifest.name),
    { ...metadata, managementNotice: "artifact" },
  );

  for (const asset of assets) {
    if (asset.relativePath === MANAGEMENT_NOTICE_FILENAME) {
      diagnostics.push({
        severity: "error",
        code: "acf.emit.managed-notice-reserved-path",
        message: `${MANAGEMENT_NOTICE_FILENAME} is reserved for ACF management notices`,
        path: path.join(skillRoot, asset.relativePath),
        family: "skill",
        capability: { name: cap.manifest.name },
        data: { facet: skill.name, sourcePath: asset.sourcePath },
      });
      continue;
    }
    await pushAssetDiff(
      diffs,
      emittedPaths,
      fs,
      path.join(skillRoot, asset.relativePath),
      asset,
      metadata,
    );
  }
}

async function pushAssetDiff(
  diffs: FileDiff[],
  emittedPaths: Set<string>,
  fs: ReadOnlyFs,
  outPath: string,
  asset: AssetPayload,
  metadata: Pick<FileDiff, "artifactRoot" | "facet">,
): Promise<void> {
  if (emittedPaths.has(outPath)) return;
  emittedPaths.add(outPath);
  const [before, beforeMode] = await Promise.all([fs.readBytes(outPath), fs.readMode(outPath)]);
  const diff = makeFileDiff(outPath, before, asset.bytes, [{ kind: "file" }], {
    before: beforeMode,
    after: asset.mode,
  });
  Object.assign(diff, metadata);
  diffs.push(diff);
}

/** The shared ACF skills root for `scope`; a target's install root is not used for it. */
export function skillsRootForScope(scope: Scope): string {
  return scope === "user"
    ? path.join(homedir(), ".agents", "skills")
    : path.join(".", ".agents", "skills");
}

/** The skill's assets, relative to the skill's own directory. */
export async function readSkillAssets(
  cap: AcfCapability,
  skill: SkillFacet,
  fs: ReadOnlyFs,
): Promise<AssetPayload[]> {
  const skillPrefix = `skills/${skill.name}/`;
  const assets = cap.assets.filter((asset) => {
    if (asset.path.startsWith(skillPrefix)) return true;
    if (asset.path.startsWith("skills/")) return false;
    return (
      "name" in asset.facet && asset.facet.family === "skill" && asset.facet.name === skill.name
    );
  });
  // Relative to the skill's own directory, which foreign packages may place outside
  // `skills/<name>/` (a Claude plugin's manifest `skills` paths).
  return await readAssets(cap, assets, fs, (assetPath) =>
    relativeAssetPathFromBase(cap, skill.dir, assetPath),
  );
}

async function pushTextDiff(
  diffs: FileDiff[],
  emittedPaths: Set<string>,
  fs: ReadOnlyFs,
  outPath: string,
  after: string,
  metadata?: Pick<FileDiff, "artifactRoot" | "facet" | "managementNotice">,
): Promise<void> {
  if (emittedPaths.has(outPath)) return;
  emittedPaths.add(outPath);
  const before = await fs.readText(outPath);
  const diff = makeFileDiff(outPath, before, after, [{ kind: "file" }]);
  if (metadata !== undefined) Object.assign(diff, metadata);
  diffs.push(diff);
}
