/**
 * The loose writer for agents, commands and instructions, plus the ACF hook refusal gate.
 * Skills (`skills.ts`) and MCP servers (`mcp.ts`) have their own writers;
 * `emitTarget` (`target.ts`) runs all three.
 */
import path from "node:path";
import {
  type AcfCapability,
  type AcfOwnership,
  type AgentFacet,
  type CanonicalTriggerName,
  type CommandFacet,
  type Diagnostic,
  type EmitInput,
  type FacetFamily,
  type FamilySupportFamily,
  type FileDiff,
  familySupportFamilies,
  hookEntries,
  type InstructionFacet,
  type ReadOnlyFs,
  type Scope,
  type TargetId,
  targetMap,
} from "@caplet/core";
import { assetsForFacet, readAssets, relativeAssetPathFromBase } from "./assets.js";
import { pushLossy } from "./diagnostics.js";
import { makeFileDiff } from "./diff.js";
import { refuseHooks } from "./hooks.js";
import { replaceMarkedBlock } from "./markers.js";
import { mcpPathFor } from "./mcp.js";
import { renderGeneratedMarkdown, renderMarkdownFile } from "./text.js";

/** Where one target's loose files go; an undefined directory means the family is not written. */
export type AdapterLayout = {
  targetId: TargetId;
  agentDir?: string | undefined;
  commandDir?: string | undefined;
  instructionWhenDir?: string | undefined;
  alwaysInstructionFile?: string | undefined;
  /** Undefined when the target has no MCP file caplet may write at the scope. */
  mcpFile: string | undefined;
  cursorRulesDir?: string | undefined;
};

/** Per-target variations of the shared loose writer. */
export type AdapterOptions = {
  /** Writes instructions only, as Cursor rules, and reports agents and commands unsupported. */
  cursorRulesOnly?: boolean | undefined;
  /** Families whose `partial` support is reported lossy (`changed-behavior`). */
  lossyPartialFamilies?: readonly FamilySupportFamily[] | undefined;
};

/**
 * The loose layout of `targetId` under `installRoot`. Every target gets the same directory names;
 * only Claude has an always-on instruction file (`CLAUDE.md`), and `mcpFile` comes from
 * `mcpPathFor`.
 */
export function layoutFor(targetId: TargetId, installRoot: string, scope: Scope): AdapterLayout {
  return {
    targetId,
    agentDir: path.join(installRoot, "agents"),
    commandDir: path.join(installRoot, "commands"),
    instructionWhenDir: path.join(installRoot, ".acf", "instructions"),
    alwaysInstructionFile: targetId === "claude" ? path.join(installRoot, "CLAUDE.md") : undefined,
    mcpFile: mcpPathFor(targetId, installRoot, scope),
    cursorRulesDir: path.join(installRoot, "rules"),
  };
}

/**
 * Writes agents, commands and instructions for `layout.targetId`, refuses ACF hooks, and
 * pushes support diagnostics to `diagnostics`. Returns the diffs sorted by path.
 */
export async function emitStandardAdapter(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  diagnostics: Diagnostic[],
  options: AdapterOptions = {},
): Promise<FileDiff[]> {
  diagnoseSupport(
    input.capability,
    layout.targetId,
    diagnostics,
    options.lossyPartialFamilies ?? [],
  );
  const diffs: FileDiff[] = [];
  if (!options.cursorRulesOnly) {
    diffs.push(
      ...(await emitProseFiles(input.capability, input.capability.agents, layout.agentDir, fs)),
    );
    diffs.push(
      ...(await emitProseFiles(input.capability, input.capability.commands, layout.commandDir, fs)),
    );
  } else {
    diagnoseCursorProse(input.capability, layout.targetId, diagnostics);
  }
  diffs.push(
    ...(await emitInstructions(input, fs, layout, diagnostics, Boolean(options.cursorRulesOnly))),
  );
  refuseHooks(input, layout.targetId, diagnostics);
  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

/** Writes each agent or command as `<dir>/<name>.md` with its assets beside it. */
export async function emitProseFiles(
  cap: AcfCapability,
  facets: readonly (AgentFacet | CommandFacet)[],
  dir: string | undefined,
  fs: ReadOnlyFs,
): Promise<FileDiff[]> {
  if (dir === undefined) return [];
  const diffs: FileDiff[] = [];
  for (const facet of [...facets].sort((a, b) => a.name.localeCompare(b.name))) {
    const outPath = path.join(dir, `${facet.name}.md`);
    const before = await fs.readText(outPath);
    diffs.push(
      makeFileDiff(outPath, before, renderMarkdownFile(facet.frontmatter, facet.body), [
        { kind: "file" },
      ]),
    );
    const assets = await readProseAssets(cap, facet, fs);
    for (const asset of assets) {
      const assetPath = path.join(dir, asset.relativePath);
      const [assetBefore, beforeMode] = await Promise.all([
        fs.readBytes(assetPath),
        fs.readMode(assetPath),
      ]);
      diffs.push(
        makeFileDiff(assetPath, assetBefore, asset.bytes, [{ kind: "file" }], {
          before: beforeMode,
          after: asset.mode,
        }),
      );
    }
  }
  return diffs;
}

/**
 * Writes instructions: `always` ones into marked blocks of the always-on file when the layout has
 * one (else as files), triggered ones as files under `instructionWhenDir` with their activation
 * recorded in a comment, or as Cursor rules when `cursorRulesOnly`. Unsupported triggers are
 * reported lossy.
 */
export async function emitInstructions(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  diagnostics: Diagnostic[],
  cursorRulesOnly: boolean,
): Promise<FileDiff[]> {
  const diffs: FileDiff[] = [];
  const blocks: MarkedBlock[] = [];
  const sorted = [...input.capability.instructions].sort((a, b) => a.name.localeCompare(b.name));
  for (const instruction of sorted) {
    if (instruction.frontmatter.activation === "always") {
      if (cursorRulesOnly) {
        pushLossy(diagnostics, {
          code: "acf.adapter.trigger-unsupported",
          message: `${layout.targetId} only emits file_context instructions as Cursor rules`,
          targetId: layout.targetId,
          family: "instruction",
          data: { instruction: instruction.name, activation: "always" },
        });
        diagnoseUnemittedInstructionAssets(
          input.capability,
          instruction,
          layout.targetId,
          diagnostics,
        );
        continue;
      }
      if (layout.alwaysInstructionFile !== undefined) {
        blocks.push({
          name: markerName(input.capability, instruction),
          body: instruction.body.trimEnd(),
        });
        diffs.push(
          ...(await instructionAssetDiffs(
            input.capability,
            instruction,
            fs,
            path.dirname(layout.alwaysInstructionFile),
          )),
        );
        continue;
      }
      const alwaysDiff = await instructionFileDiff(input, fs, layout, instruction);
      if (alwaysDiff !== null) diffs.push(alwaysDiff);
      continue;
    }
    diagnoseTriggers(instruction, layout.targetId, diagnostics);
    if (cursorRulesOnly) {
      if (!hasTrigger(instruction, "file_context")) continue;
      const rulesDir = layout.cursorRulesDir;
      if (rulesDir === undefined) continue;
      const outPath = path.join(
        rulesDir,
        `${input.capability.manifest.name}__${instruction.name}.mdc`,
      );
      const before = await fs.readText(outPath);
      diffs.push(makeFileDiff(outPath, before, renderCursorRule(instruction), [{ kind: "file" }]));
      diffs.push(...(await instructionAssetDiffs(input.capability, instruction, fs, rulesDir)));
      continue;
    }
    const triggeredDiff = await instructionFileDiff(input, fs, layout, instruction);
    if (triggeredDiff !== null) {
      diffs.push(triggeredDiff);
      const instructionDir = path.dirname(triggeredDiff.path);
      diffs.push(
        ...(await instructionAssetDiffs(input.capability, instruction, fs, instructionDir)),
      );
    }
  }
  if (blocks.length > 0 && layout.alwaysInstructionFile !== undefined)
    diffs.push(await markedBlocksDiff(fs, layout.alwaysInstructionFile, blocks));
  return diffs;
}

/** One caplet-owned region of a shared text file. */
type MarkedBlock = { name: string; body: string };

/** Writes `blocks` into `file` as marked regions, keeping the rest of the file. */
async function markedBlocksDiff(
  fs: ReadOnlyFs,
  file: string,
  blocks: readonly MarkedBlock[],
): Promise<FileDiff> {
  const before = await fs.readText(file);
  let after = before ?? "";
  for (const { name, body } of blocks) after = replaceMarkedBlock(after, name, body);
  return makeFileDiff(
    file,
    before,
    after,
    blocks.map(({ name }) => ({ kind: "marker", name }) satisfies AcfOwnership),
  );
}

async function instructionFileDiff(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  instruction: InstructionFacet,
): Promise<FileDiff | null> {
  const instructionDir = layout.instructionWhenDir;
  if (instructionDir === undefined) return null;
  const outPath = path.join(
    instructionDir,
    input.capability.manifest.name,
    `${instruction.name}.md`,
  );
  const before = await fs.readText(outPath);
  return makeFileDiff(outPath, before, renderInstructionFile(instruction), [{ kind: "file" }]);
}

async function readProseAssets(
  cap: AcfCapability,
  facet: AgentFacet | CommandFacet | InstructionFacet,
  fs: ReadOnlyFs,
) {
  const baseDir =
    facet.source.kind === "directory" ? facet.source.path : path.dirname(facet.source.primary);
  return await readAssets(cap, assetsForFacet(cap, facet.family, facet.name), fs, (assetPath) =>
    relativeAssetPathFromBase(cap, baseDir, assetPath),
  );
}

async function instructionAssetDiffs(
  cap: AcfCapability,
  instruction: InstructionFacet,
  fs: ReadOnlyFs,
  outDir: string,
): Promise<FileDiff[]> {
  const diffs: FileDiff[] = [];
  const assets = await readProseAssets(cap, instruction, fs);
  for (const asset of assets) {
    const outPath = path.join(outDir, asset.relativePath);
    const [before, beforeMode] = await Promise.all([fs.readBytes(outPath), fs.readMode(outPath)]);
    diffs.push(
      makeFileDiff(outPath, before, asset.bytes, [{ kind: "file" }], {
        before: beforeMode,
        after: asset.mode,
      }),
    );
  }
  return diffs;
}

function diagnoseUnemittedInstructionAssets(
  cap: AcfCapability,
  instruction: InstructionFacet,
  targetId: TargetId,
  diagnostics: Diagnostic[],
): void {
  for (const asset of assetsForFacet(cap, "instruction", instruction.name)) {
    pushLossy(diagnostics, {
      code: "acf.assets.unsupported",
      message: `${targetId} did not emit instruction ${instruction.name}; asset was not transported: ${asset.path}`,
      targetId,
      family: "instruction",
      path: asset.path,
      data: { instruction: instruction.name },
    });
  }
}

function diagnoseSupport(
  cap: AcfCapability,
  targetId: TargetId,
  diagnostics: Diagnostic[],
  lossyPartialFamilies: readonly FamilySupportFamily[],
): void {
  const support = targetMap[targetId]?.support ?? {};
  // Skills and MCP have no family-level gate; field-level support cells govern them.
  for (const family of familySupportFamilies) {
    // ACF hooks use field-level refusals, not a lossy family-level omission.
    if (family === "hook" || !familyHasItems(cap, family)) continue;
    const level = support[family];
    if (level === "none") {
      pushLossy(diagnostics, {
        code: "acf.adapter.facet-unsupported",
        message: `${targetId} does not support ${family} facets`,
        targetId,
        family,
      });
    } else if (level === "partial" && lossyPartialFamilies.includes(family)) {
      pushLossy(diagnostics, {
        code: "acf.adapter.facet-unsupported",
        message: `${targetId} only partially supports ${family} facets; emitted a degraded artifact`,
        targetId,
        family,
        data: { outcome: "changed-behavior" },
      });
    }
  }
}

function diagnoseCursorProse(
  cap: AcfCapability,
  targetId: TargetId,
  diagnostics: Diagnostic[],
): void {
  for (const family of ["agent", "command"] as const) {
    if (!familyHasItems(cap, family)) continue;
    pushLossy(diagnostics, {
      code: "acf.adapter.facet-unsupported",
      message: `${targetId} does not natively support ${family}; facet is not emitted`,
      targetId,
      family,
    });
  }
}

function familyHasItems(cap: AcfCapability, family: FacetFamily): boolean {
  switch (family) {
    case "skill":
      return cap.skills.length > 0;
    case "agent":
      return cap.agents.length > 0;
    case "command":
      return cap.commands.length > 0;
    case "instruction":
      return cap.instructions.length > 0;
    case "hook":
      return hookEntries(cap.hooks).length > 0;
    case "mcp":
      return (cap.mcp?.servers.length ?? 0) > 0;
  }
}

function diagnoseTriggers(
  instruction: InstructionFacet,
  targetId: TargetId,
  diagnostics: Diagnostic[],
): void {
  const activation = instruction.frontmatter.activation;
  if (activation === "always") return;
  for (const trigger of Object.keys(activation.when) as CanonicalTriggerName[]) {
    const support = targetMap[targetId]?.mappings.instructionTriggers[trigger];
    if (support === "full") continue;
    pushLossy(diagnostics, {
      code: "acf.adapter.trigger-unsupported",
      message: `${targetId} has ${support ?? "no"} support for instruction trigger ${trigger}`,
      targetId,
      family: "instruction",
      data: { instruction: instruction.name, trigger, support },
    });
  }
}

function hasTrigger(instruction: InstructionFacet, trigger: CanonicalTriggerName): boolean {
  const activation = instruction.frontmatter.activation;
  return activation !== "always" && activation.when[trigger] !== undefined;
}

function renderInstructionFile(instruction: InstructionFacet): string {
  const activation = instruction.frontmatter.activation;
  const title = instruction.frontmatter.name;
  if (activation === "always") return renderGeneratedMarkdown(title, instruction.body);
  return renderGeneratedMarkdown(
    title,
    `${instruction.body.trimEnd()}\n\n<!-- acf:activation ${JSON.stringify(activation)} -->`,
  );
}

function renderCursorRule(instruction: InstructionFacet): string {
  const activation = instruction.frontmatter.activation;
  const globs = activation === "always" ? [] : fileContextPaths(activation.when.file_context);
  const frontmatter: Record<string, unknown> = { description: instruction.frontmatter.description };
  if (globs.length > 0) frontmatter.globs = globs;
  return renderMarkdownFile(frontmatter, instruction.body);
}

function markerName(cap: AcfCapability, instruction: InstructionFacet): string {
  return `${cap.manifest.name}.${instruction.name}`;
}

function fileContextPaths(trigger: unknown): string[] {
  if (typeof trigger !== "object" || trigger === null || !("paths" in trigger)) return [];
  const paths = trigger.paths;
  return Array.isArray(paths)
    ? paths.filter((value): value is string => typeof value === "string")
    : [];
}
