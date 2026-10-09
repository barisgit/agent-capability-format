/**
 * The loose hook writer: one script per hook entry in the target's hook directory, and one
 * settings entry per native event the entry maps to, owned by JSON pointer and found again by
 * its `acfMarker`.
 */
import path from "node:path";
import {
  type AcfCapability,
  type AcfOwnership,
  type CanonicalHookType,
  canonicalHookTypes,
  type Diagnostic,
  defaultHookTimeoutMs,
  type EmitInput,
  type FileDiff,
  type HookEffect,
  type HookEntry,
  type HookRun,
  hookEffectMatrix,
  isRecord,
  type ReadOnlyFs,
  type TargetId,
  targetMap,
} from "@caplet/core";
import { pushLossy } from "./diagnostics.js";
import { makeFileDiff } from "./diff.js";
import type { AdapterLayout } from "./emitter.js";
import { jsonPointerEscape, mergeJson, readJsonObject } from "./json-merge.js";
import {
  type PlaceholderValues,
  substitutePlaceholders,
  substituteStringArray,
  substituteStringRecord,
} from "./placeholders.js";

/**
 * Writes the capability's hooks for `layout.targetId`: canonical hook types through the target's
 * event mapping (a type the target lacks is reported lossy), then target-native events. Each entry
 * replaces the settings entry carrying its marker, else is appended to its event's list.
 */
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
  const entriesByNativeEvent = new Map<string, HookSettingsEntry[]>();
  for (const { type, entry, nativeEvents } of plannedHooks(hooks, layout.targetId, diagnostics)) {
    const effect = degradeEffectIfNeeded(type, entry, layout.targetId, diagnostics);
    const id = hookIdentity(input.capability, type, nativeEvents, entry);
    const scriptPath = path.join(hookDir, `${id.script}${hookExtension(entry.run)}`);
    const scriptBefore = await fs.readText(scriptPath);
    diffs.push(makeFileDiff(scriptPath, scriptBefore, renderHookScript(entry), [{ kind: "file" }]));
    for (const eventName of nativeEvents) {
      const settingsEntry = hookSettingsEntry(
        input.capability,
        type,
        eventName,
        entry,
        effect,
        scriptPath,
        id.marker,
      );
      const bucket = entriesByNativeEvent.get(eventName) ?? [];
      bucket.push(settingsEntry);
      entriesByNativeEvent.set(eventName, bucket);
    }
  }
  const settingsDiff = await hookSettingsDiff(
    fs,
    settingsFile,
    input.capability.manifest.name,
    entriesByNativeEvent,
  );
  if (settingsDiff !== null) diffs.push(settingsDiff);
  return diffs;
}

/** One hook entry with the native events it is written to. */
type PlannedHook = {
  type: CanonicalHookType | undefined;
  entry: HookEntry;
  nativeEvents: readonly string[];
};

/**
 * Canonical types through the target's mapping, then target-native events (SPEC.md §13.9) as
 * declared. `hooks` is already filtered to the entries that apply to `targetId`.
 */
function plannedHooks(
  hooks: NonNullable<AcfCapability["hooks"]>,
  targetId: TargetId,
  diagnostics: Diagnostic[],
): PlannedHook[] {
  const planned: PlannedHook[] = [];
  for (const type of canonicalHookTypes) {
    const entries = hooks.buckets[type] ?? [];
    const nativeEvents = targetMap[targetId]?.mappings.hookEvents[type] ?? [];
    if (entries.length > 0 && nativeEvents.length === 0) {
      pushLossy(diagnostics, {
        code: "acf.adapter.hook-event-unsupported",
        message: `${targetId} does not support hook event ${type}`,
        targetId,
        family: "hook",
        data: { hookType: type },
      });
      continue;
    }
    for (const entry of entries) planned.push({ type, entry, nativeEvents });
  }
  for (const [event, entries] of Object.entries(hooks.native?.[targetId] ?? {}))
    for (const entry of entries) planned.push({ type: undefined, entry, nativeEvents: [event] });
  return planned;
}

/**
 * Merges `entriesByNativeEvent` into the settings file, events in name order. An entry replaces
 * the one carrying its marker, else is appended; null when there is nothing to write.
 */
async function hookSettingsDiff(
  fs: ReadOnlyFs,
  settingsFile: string,
  capabilityName: string,
  entriesByNativeEvent: ReadonlyMap<string, readonly HookSettingsEntry[]>,
): Promise<FileDiff | null> {
  const before = await fs.readText(settingsFile);
  let settings = before;
  const owns: AcfOwnership[] = [];
  const events = [...entriesByNativeEvent.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [eventName, entries] of events) {
    for (const entry of entries) {
      const current = readHookEntries(settings, eventName);
      const markerIndex = (marker: string) =>
        current.findIndex((item) => isRecord(item) && item.acfMarker === marker);
      // Entries written before markers named the hook type carry `acf:<capability>:<name>`;
      // taking over their index keeps the owned pointer the sidecar recorded for them.
      const ownIndex = markerIndex(entry.acfMarker);
      const replaceIndex =
        ownIndex === -1 ? markerIndex(`acf:${capabilityName}:${entry.name}`) : ownIndex;
      const index = replaceIndex === -1 ? current.length : replaceIndex;
      settings = mergeJson(settings, `/hooks/${jsonPointerEscape(eventName)}/${index}`, entry);
      owns.push({ kind: "json-pointer", pointer: `/hooks/${eventName}/${index}` });
    }
  }
  return owns.length > 0 ? makeFileDiff(settingsFile, before, settings, owns) : null;
}

/**
 * The effect `entry` is written with: `observe` when its canonical hook type does not allow the
 * declared effect or the target only partially supports hook effects. A target-native event
 * (`type` undefined) has no canonical effect matrix.
 */
function degradeEffectIfNeeded(
  type: CanonicalHookType | undefined,
  entry: HookEntry,
  targetId: TargetId,
  diagnostics: Diagnostic[],
): HookEffect {
  if (type !== undefined && !hookEffectMatrix[type].includes(entry.effect)) {
    pushLossy(diagnostics, {
      code: "acf.adapter.effect-degraded",
      message: `${entry.effect} is not portable for ${type}; emitted as observe`,
      targetId,
      family: "hook",
      data: { hook: entry.name, hookType: type, effect: entry.effect },
    });
    return "observe";
  }
  if (targetMap[targetId]?.support.hook === "partial" && entry.effect !== "observe") {
    pushLossy(diagnostics, {
      code: "acf.adapter.effect-degraded",
      message: `${targetId} only partially supports hook effects; ${entry.effect} emitted as observe`,
      targetId,
      family: "hook",
      data: { hook: entry.name, hookType: type, effect: entry.effect },
    });
    return "observe";
  }
  return entry.effect;
}

/**
 * The names one hook entry is written under: its script file in the hook directory (without
 * extension) and its `acfMarker` in the settings file. A hook name is unique only within its
 * canonical type or native event, so both include it: `<capability>__<type>__<name>` and
 * `acf:<capability>:<type>:<name>`, or for a target-native event (SPEC.md §13.9)
 * `<capability>__native-<event>__<name>` and `acf:<capability>:native:<event>:<name>`. The event is
 * percent-encoded in the file name, so every event spelling gives a distinct, portable name.
 */
function hookIdentity(
  cap: AcfCapability,
  type: CanonicalHookType | undefined,
  nativeEvents: readonly string[],
  entry: HookEntry,
): { script: string; marker: string } {
  const capability = cap.manifest.name;
  if (type !== undefined)
    return {
      script: `${capability}__${type}__${entry.name}`,
      marker: `acf:${capability}:${type}:${entry.name}`,
    };
  const event = nativeEvents[0] ?? "";
  const fileEvent = encodeURIComponent(event).replace(
    /[!'()*~]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return {
    script: `${capability}__native-${fileEvent}__${entry.name}`,
    marker: `acf:${capability}:native:${event}:${entry.name}`,
  };
}

function hookExtension(run: HookRun): string {
  if (run.shell === "powershell") return ".ps1";
  if (run.shell === "bash") return ".sh";
  return "";
}

function renderHookScript(entry: HookEntry): string {
  if (entry.run.shell === "powershell") return `${entry.run.command.trimEnd()}\n`;
  if (entry.run.shell === "bash")
    return `#!/usr/bin/env bash\nset -euo pipefail\n${entry.run.command.trimEnd()}\n`;
  const args = entry.run.args ?? [];
  const quoted = [entry.run.command, ...args].map(shellQuote).join(" ");
  return `#!/usr/bin/env sh\nexec ${quoted} "$@"\n`;
}

function hookSettingsEntry(
  cap: AcfCapability,
  type: CanonicalHookType | undefined,
  eventName: string,
  entry: HookEntry,
  effect: HookEffect,
  scriptPath: string,
  acfMarker: string,
): HookSettingsEntry {
  const placeholders: PlaceholderValues = {
    capabilityDir: cap.root,
    hookDir: cap.hooks === undefined ? cap.root : path.dirname(cap.hooks.path),
  };
  const renderedRun: Record<string, unknown> = {
    command: substitutePlaceholders(entry.run.command, placeholders),
    script: scriptPath,
  };
  const args = substituteStringArray(entry.run.args, placeholders);
  if (args !== undefined) renderedRun.args = args;
  if (entry.run.shell !== undefined) renderedRun.shell = entry.run.shell;
  const env = substituteStringRecord(entry.run.env, placeholders);
  if (env !== undefined) renderedRun.env = env;
  const out: HookSettingsEntry = {
    acfMarker,
    name: entry.name,
    ...(type === undefined ? {} : { type }),
    event: eventName,
    effect,
    timeoutMs: entry.timeout ?? defaultHookTimeoutMs,
    run: renderedRun,
  };
  if (entry.description !== undefined) out.description = entry.description;
  if (entry.match !== undefined) out.match = entry.match;
  return out;
}

type HookSettingsEntry = {
  acfMarker: string;
  name: string;
  /** The canonical hook type; absent for a target-native event (SPEC.md §13.9). */
  type?: CanonicalHookType | undefined;
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
