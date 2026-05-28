import path from "node:path";
import {
  defaultHookTimeoutMs,
  hookEffectMatrix,
  targetMap,
  type AcfCapability,
  type AcfOwnership,
  type AgentFacet,
  type CanonicalHookType,
  type CanonicalTriggerName,
  type CommandFacet,
  type Diagnostic,
  type EmitInput,
  type FacetFamily,
  type FileDiff,
  type HookEffect,
  type HookEntry,
  type HookRun,
  type InstructionFacet,
  type McpServer,
  type ReadOnlyFs,
  type Scope,
  type TargetId,
} from "@acf/core";
import { makeFileDiff } from "./diff";
import { pushLossy } from "./diagnostics";
import { jsonPointerEscape, mergeJson, readJsonObject } from "./json-merge";
import { replaceMarkedBlock } from "./markers";
import {
  type PlaceholderValues,
  substitutePlaceholders,
  substituteStringArray,
  substituteStringRecord,
} from "./placeholders";
import { renderGeneratedMarkdown, renderMarkdownFile } from "./text";

export type AdapterLayout = {
  targetId: TargetId;
  agentDir?: string | undefined;
  commandDir?: string | undefined;
  instructionWhenDir?: string | undefined;
  alwaysInstructionFile?: string | undefined;
  hookDir?: string | undefined;
  hookSettingsFile?: string | undefined;
  mcpFile: string;
  cursorRulesDir?: string | undefined;
};

export type AdapterOptions = {
  cursorRulesOnly?: boolean | undefined;
  skipUnsupportedHooks?: boolean | undefined;
  lossyPartialFamilies?: readonly FacetFamily[] | undefined;
};

export function layoutFor(targetId: TargetId, installRoot: string, scope: Scope): AdapterLayout {
  return {
    targetId,
    agentDir: path.join(installRoot, "agents"),
    commandDir: path.join(installRoot, "commands"),
    instructionWhenDir: path.join(installRoot, ".acf", "instructions"),
    alwaysInstructionFile: targetId === "claude" ? path.join(installRoot, "CLAUDE.md") : undefined,
    hookDir: path.join(installRoot, "hooks"),
    hookSettingsFile: path.join(installRoot, "settings.json"),
    mcpFile: mcpPathFor(targetId, installRoot, scope),
    cursorRulesDir: path.join(installRoot, "rules"),
  };
}

export async function emitStandardAdapter(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  diagnostics: Diagnostic[],
  options: AdapterOptions = {},
): Promise<FileDiff[]> {
  diagnoseSupport(input.capability, layout.targetId, diagnostics, options.lossyPartialFamilies ?? []);
  const diffs: FileDiff[] = [];
  if (!options.cursorRulesOnly) {
    diffs.push(...(await emitProseFiles(input.capability.agents, layout.agentDir, fs)));
    diffs.push(...(await emitProseFiles(input.capability.commands, layout.commandDir, fs)));
  } else {
    diagnoseCursorProse(input.capability, layout.targetId, diagnostics);
  }
  diffs.push(...(await emitInstructions(input, fs, layout, diagnostics, Boolean(options.cursorRulesOnly))));
  if (!options.skipUnsupportedHooks) diffs.push(...(await emitHooks(input, fs, layout, diagnostics)));
  diffs.push(...(await emitMcp(input, fs, layout, diagnostics)));
  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

export async function emitProseFiles(
  facets: readonly (AgentFacet | CommandFacet)[],
  dir: string | undefined,
  fs: ReadOnlyFs,
): Promise<FileDiff[]> {
  if (dir === undefined) return [];
  const diffs: FileDiff[] = [];
  for (const facet of [...facets].sort((a, b) => a.name.localeCompare(b.name))) {
    const outPath = path.join(dir, `${facet.name}.md`);
    const before = await fs.readText(outPath);
    diffs.push(makeFileDiff(outPath, before, renderMarkdownFile(facet.frontmatter, facet.body), [
      { kind: "file" },
    ]));
  }
  return diffs;
}

export async function emitInstructions(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  diagnostics: Diagnostic[],
  cursorRulesOnly: boolean,
): Promise<FileDiff[]> {
  const diffs: FileDiff[] = [];
  const markerBodies: string[] = [];
  const markerNames: string[] = [];
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
        continue;
      }
      if (layout.alwaysInstructionFile !== undefined) {
        markerBodies.push(instruction.body.trimEnd());
        markerNames.push(markerName(input.capability, instruction));
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
      const outPath = path.join(rulesDir, `${input.capability.manifest.name}__${instruction.name}.mdc`);
      const before = await fs.readText(outPath);
      diffs.push(makeFileDiff(outPath, before, renderCursorRule(instruction), [{ kind: "file" }]));
      continue;
    }
    const triggeredDiff = await instructionFileDiff(input, fs, layout, instruction);
    if (triggeredDiff !== null) diffs.push(triggeredDiff);
  }
  if (markerBodies.length > 0 && layout.alwaysInstructionFile !== undefined) {
    const before = await fs.readText(layout.alwaysInstructionFile);
    let after = before ?? "";
    for (let index = 0; index < markerBodies.length; index += 1) {
      const name = markerNames[index];
      const body = markerBodies[index];
      if (name === undefined || body === undefined) continue;
      after = replaceMarkedBlock(after, name, body);
    }
    diffs.push(
      makeFileDiff(
        layout.alwaysInstructionFile,
        before,
        after,
        markerNames.map((name) => ({ kind: "marker", name }) satisfies AcfOwnership),
      ),
    );
  }
  return diffs;
}

export async function emitHooks(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  diagnostics: Diagnostic[],
): Promise<FileDiff[]> {
  const hooks = input.capability.hooks;
  if (hooks === undefined) return [];
  const hookDir = layout.hookDir;
  const settingsFile = layout.hookSettingsFile;
  if (hookDir === undefined || settingsFile === undefined) return [];
  const diffs: FileDiff[] = [];
  const beforeSettings = await fs.readText(settingsFile);
  let settings = beforeSettings;
  const entriesByNativeEvent = new Map<string, HookSettingsEntry[]>();
  for (const type of canonicalHookTypesInOrder()) {
    const entries = hooks.buckets[type] ?? [];
    const nativeEvents = targetMap[layout.targetId]?.mappings.hookEvents[type] ?? [];
    if (entries.length > 0 && nativeEvents.length === 0) {
      pushLossy(diagnostics, {
        code: "acf.adapter.hook-event-unsupported",
        message: `${layout.targetId} does not support hook event ${type}`,
        targetId: layout.targetId,
        family: "hook",
        data: { hookType: type },
      });
      continue;
    }
    for (const entry of entries) {
      const effect = degradeEffectIfNeeded(type, entry, layout.targetId, diagnostics);
      const scriptPath = path.join(hookDir, `${input.capability.manifest.name}__${entry.name}${hookExtension(entry.run)}`);
      const scriptBefore = await fs.readText(scriptPath);
      diffs.push(makeFileDiff(scriptPath, scriptBefore, renderHookScript(entry), [{ kind: "file" }]));
      for (const eventName of nativeEvents) {
        const settingsEntry = hookSettingsEntry(input.capability, type, eventName, entry, effect, scriptPath);
        const bucket = entriesByNativeEvent.get(eventName) ?? [];
        bucket.push(settingsEntry);
        entriesByNativeEvent.set(eventName, bucket);
      }
    }
  }
  const owns: AcfOwnership[] = [];
  for (const [eventName, entries] of [...entriesByNativeEvent.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const entry of entries) {
      const current = readHookEntries(settings, eventName);
      const replaceIndex = current.findIndex((item) => isRecord(item) && item.acfMarker === entry.acfMarker);
      const index = replaceIndex === -1 ? current.length : replaceIndex;
      settings = mergeJson(settings, `/hooks/${jsonPointerEscape(eventName)}/${index}`, entry);
      owns.push({ kind: "json-pointer", pointer: `/hooks/${eventName}/${index}` });
    }
  }
  if (owns.length > 0) diffs.push(makeFileDiff(settingsFile, beforeSettings, settings, owns));
  return diffs;
}

export async function emitMcp(
  input: EmitInput,
  fs: ReadOnlyFs,
  layout: AdapterLayout,
  diagnostics: Diagnostic[],
): Promise<FileDiff[]> {
  const mcp = input.capability.mcp;
  if (mcp === undefined || mcp.servers.length === 0) return [];
  const before = await fs.readText(layout.mcpFile);
  let after = before;
  const owns: AcfOwnership[] = [];
  for (const server of [...mcp.servers].sort((a, b) => a.name.localeCompare(b.name))) {
    const emitted = emitMcpServer(server, input.capability, diagnostics, layout.targetId);
    if (emitted === null) continue;
    const pointer = `/mcpServers/${jsonPointerEscape(server.name)}`;
    after = mergeJson(after, pointer, emitted);
    owns.push({ kind: "json-pointer", pointer });
  }
  if (owns.length === 0) return [];
  return [makeFileDiff(layout.mcpFile, before, after, owns)];
}

async function instructionFileDiff(input: EmitInput, fs: ReadOnlyFs, layout: AdapterLayout, instruction: InstructionFacet): Promise<FileDiff | null> {
  const instructionDir = layout.instructionWhenDir;
  if (instructionDir === undefined) return null;
  const outPath = path.join(instructionDir, input.capability.manifest.name, `${instruction.name}.md`);
  const before = await fs.readText(outPath);
  return makeFileDiff(outPath, before, renderInstructionFile(instruction), [{ kind: "file" }]);
}

function diagnoseSupport(cap: AcfCapability, targetId: TargetId, diagnostics: Diagnostic[], lossyPartialFamilies: readonly FacetFamily[]): void {
  const support = targetMap[targetId]?.support ?? {};
  for (const family of ["skill", "agent", "command", "instruction", "hook", "mcp"] as const) {
    if (!familyHasItems(cap, family)) continue;
    const level = support[family];
    if (level === "none") {
      pushLossy(diagnostics, { code: "acf.adapter.facet-unsupported", message: `${targetId} does not support ${family} facets`, targetId, family });
    } else if (level === "partial" && lossyPartialFamilies.includes(family)) {
      pushLossy(diagnostics, { code: "acf.adapter.facet-unsupported", message: `${targetId} only partially supports ${family} facets; emitted a degraded artifact`, targetId, family });
    }
  }
}

function diagnoseCursorProse(cap: AcfCapability, targetId: TargetId, diagnostics: Diagnostic[]): void {
  for (const family of ["skill", "agent", "command"] as const) {
    if (!familyHasItems(cap, family)) continue;
    pushLossy(diagnostics, { code: "acf.adapter.facet-unsupported", message: `${targetId} does not natively support ${family}; facet is not emitted`, targetId, family });
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
      return Object.values(cap.hooks?.buckets ?? {}).some((entries) => (entries?.length ?? 0) > 0);
    case "mcp":
      return (cap.mcp?.servers.length ?? 0) > 0;
  }
}

function diagnoseTriggers(instruction: InstructionFacet, targetId: TargetId, diagnostics: Diagnostic[]): void {
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
  return renderGeneratedMarkdown(title, `${instruction.body.trimEnd()}\n\n<!-- acf:activation ${JSON.stringify(activation)} -->`);
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
  return Array.isArray(paths) ? paths.filter((value): value is string => typeof value === "string") : [];
}

function degradeEffectIfNeeded(type: CanonicalHookType, entry: HookEntry, targetId: TargetId, diagnostics: Diagnostic[]): HookEffect {
  const canonicalAllowed = hookEffectMatrix[type];
  if (!canonicalAllowed.includes(entry.effect)) {
    pushLossy(diagnostics, { code: "acf.adapter.effect-degraded", message: `${entry.effect} is not portable for ${type}; emitted as observe`, targetId, family: "hook", data: { hook: entry.name, hookType: type, effect: entry.effect } });
    return "observe";
  }
  if (targetMap[targetId]?.support.hook === "partial" && entry.effect !== "observe") {
    pushLossy(diagnostics, { code: "acf.adapter.effect-degraded", message: `${targetId} only partially supports hook effects; ${entry.effect} emitted as observe`, targetId, family: "hook", data: { hook: entry.name, hookType: type, effect: entry.effect } });
    return "observe";
  }
  return entry.effect;
}

function hookExtension(run: HookRun): string {
  if (run.shell === "powershell") return ".ps1";
  if (run.shell === "bash") return ".sh";
  return "";
}

function renderHookScript(entry: HookEntry): string {
  if (entry.run.shell === "powershell") return `${entry.run.command.trimEnd()}\n`;
  if (entry.run.shell === "bash") return `#!/usr/bin/env bash\nset -euo pipefail\n${entry.run.command.trimEnd()}\n`;
  const args = entry.run.args ?? [];
  const quoted = [entry.run.command, ...args].map(shellQuote).join(" ");
  return `#!/usr/bin/env sh\nexec ${quoted} "$@"\n`;
}

function hookSettingsEntry(cap: AcfCapability, type: CanonicalHookType, eventName: string, entry: HookEntry, effect: HookEffect, scriptPath: string): HookSettingsEntry {
  const placeholders: PlaceholderValues = { capabilityDir: cap.root, hookDir: cap.hooks === undefined ? cap.root : path.dirname(cap.hooks.path) };
  const renderedRun: Record<string, unknown> = { command: substitutePlaceholders(entry.run.command, placeholders), script: scriptPath };
  const args = substituteStringArray(entry.run.args, placeholders);
  if (args !== undefined) renderedRun.args = args;
  if (entry.run.shell !== undefined) renderedRun.shell = entry.run.shell;
  const env = substituteStringRecord(entry.run.env, placeholders);
  if (env !== undefined) renderedRun.env = env;
  const out: HookSettingsEntry = { acfMarker: `acf:${cap.manifest.name}:${entry.name}`, name: entry.name, type, event: eventName, effect, timeoutMs: entry.timeout ?? defaultHookTimeoutMs, run: renderedRun };
  if (entry.description !== undefined) out.description = entry.description;
  if (entry.match !== undefined) out.match = entry.match;
  return out;
}

type HookSettingsEntry = {
  acfMarker: string;
  name: string;
  type: CanonicalHookType;
  event: string;
  effect: HookEffect;
  timeoutMs: number;
  run: Record<string, unknown>;
  description?: string | undefined;
  match?: HookEntry["match"] | undefined;
};

function readHookEntries(text: string | null, eventName: string): unknown[] {
  const root = readJsonObject(text);
  const hooks = root.hooks;
  if (!isRecord(hooks)) return [];
  const entries = hooks[eventName];
  return Array.isArray(entries) ? entries : [];
}

function emitMcpServer(server: McpServer, cap: AcfCapability, diagnostics: Diagnostic[], targetId: TargetId): Record<string, unknown> | null {
  if (!isTransportSupported(server.transport)) {
    pushLossy(diagnostics, { code: "acf.adapter.mcp-unsupported", message: `${targetId} does not support MCP transport ${server.transport}`, targetId, family: "mcp", data: { server: server.name, transport: server.transport } });
    return null;
  }
  const placeholders: PlaceholderValues = { capabilityDir: cap.root, hookDir: cap.mcp === undefined ? cap.root : path.dirname(cap.mcp.path) };
  if (server.transport === "stdio") {
    const out: Record<string, unknown> = { transport: "stdio", command: substitutePlaceholders(server.command, placeholders) };
    const args = substituteStringArray(server.args, placeholders);
    if (args !== undefined) out.args = args;
    const env = substituteStringRecord(server.env, placeholders);
    if (env !== undefined) out.env = env;
    return out;
  }
  const out: Record<string, unknown> = { transport: server.transport, url: substitutePlaceholders(server.url, placeholders) };
  const headers = substituteStringRecord(server.headers, placeholders);
  if (headers !== undefined) out.headers = headers;
  return out;
}

function isTransportSupported(transport: McpServer["transport"]): boolean {
  return transport === "stdio" || transport === "http" || transport === "sse";
}

function mcpPathFor(targetId: TargetId, installRoot: string, scope: Scope): string {
  if (targetId === "claude" && scope === "project") return path.join(path.dirname(installRoot), ".mcp.json");
  return path.join(installRoot, "mcp.json");
}

function canonicalHookTypesInOrder(): CanonicalHookType[] {
  return ["session_start", "user_prompt_submit", "pre_tool", "permission_request", "post_tool", "stop", "pre_compact"];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
