import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  type CapabilityEntry,
  CREDENTIAL_IN_URL,
  capabilitiesYmlSchema,
  type Diagnostic,
  type FacetFamily,
  parseYaml,
  pushZodIssues,
  sourceUrlCredentialProblem,
} from "@caplet/core";
import { entrySourceId } from "./lockfile.js";

export async function readCapabilitiesYml(
  manifestPath: string,
): Promise<{ value: CapabilitiesYml; diagnostics: Diagnostic[] }> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { value: emptyCapabilitiesYml(), diagnostics: [] };
    throw error;
  }

  const diagnostics: Diagnostic[] = [];
  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(raw);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "acf.capabilities-yml.invalid",
      message: error instanceof Error ? error.message : "invalid capabilities.yml",
      path: manifestPath,
    });
    return { value: emptyCapabilitiesYml(), diagnostics };
  }

  const parsed = capabilitiesYmlSchema.safeParse(padSelectorsForCoreSchema(parsedYaml));
  if (!parsed.success) {
    describeUnknownKeys(parsed.error.issues);
    pushZodIssues(diagnostics, parsed.error, manifestPath, {
      baseCode: "acf.capabilities-yml.invalid",
    });
    return { value: emptyCapabilitiesYml(), diagnostics };
  }

  const value = restorePartialSelectors(parsed.data as CapabilitiesYml, parsedYaml);
  const credentialDiagnostics = credentialSourceDiagnostics(value, manifestPath);
  if (credentialDiagnostics.length > 0) {
    // Nothing from this manifest is used: any later message naming the entry could echo it.
    return { value: emptyCapabilitiesYml(), diagnostics: credentialDiagnostics };
  }
  diagnostics.push(...duplicateEntryDiagnostics(value, path.dirname(manifestPath)));
  return { value, diagnostics };
}

const selectorFamilies: FacetFamily[] = ["skill", "agent", "command", "instruction", "hook", "mcp"];

function padSelectorsForCoreSchema(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.capabilities)) return value;
  return {
    ...value,
    capabilities: value.capabilities.map((entry) => {
      if (!isRecord(entry)) return entry;
      return {
        ...entry,
        include: padSelector(entry.include),
        exclude: padSelector(entry.exclude),
      };
    }),
  };
}

function padSelector(value: unknown): unknown {
  if (!isSelector(value)) return value;
  const padded: Record<string, string[]> = {};
  for (const family of selectorFamilies) padded[family] = value[family] ?? [];
  return padded;
}

function restorePartialSelectors(value: CapabilitiesYml, raw: unknown): CapabilitiesYml {
  if (!isRecord(raw)) return value;
  const rawCapabilities = raw.capabilities;
  if (!Array.isArray(rawCapabilities)) return value;
  const capabilities = value.capabilities.map((entry, index) => {
    const restored: CapabilityEntry = { ...entry };
    const rawEntry = rawCapabilities[index];
    if (isRecord(rawEntry) && isSelector(rawEntry.include)) restored.include = rawEntry.include;
    else if (restored.include !== undefined) delete restored.include;
    if (isRecord(rawEntry) && isSelector(rawEntry.exclude)) restored.exclude = rawEntry.exclude;
    else if (restored.exclude !== undefined) delete restored.exclude;
    return restored;
  });
  const restored: CapabilitiesYml = { acf: 1, capabilities };
  if (value.defaults !== undefined) restored.defaults = value.defaults;
  return restored;
}

const knownKeysByPath: Record<string, string[]> = {
  "": ["acf", "capabilities", "defaults"],
  capabilities: [
    "source",
    "ref",
    "path",
    "capabilities",
    "include",
    "exclude",
    "rename",
    "only",
    "except",
  ],
  defaults: ["fetch"],
  "defaults.fetch": ["shallow", "blobless"],
};

function describeUnknownKeys(
  issues: { code: string; keys?: string[]; path: PropertyKey[]; message: string }[],
): void {
  for (const issue of issues) {
    if (issue.code !== "unrecognized_keys" || issue.keys === undefined) continue;
    const pathKey = issue.path
      .filter((segment): segment is string => typeof segment === "string")
      .join(".");
    const knownKeys = knownKeysByPath[pathKey] ?? [];
    issue.message = issue.keys
      .map((key) => {
        const suggestion = closestKey(key, knownKeys);
        const hint = suggestion === undefined ? "" : ` — did you mean "${suggestion}"?`;
        return `unknown key "${key}"${hint}`;
      })
      .join("; ");
  }
}

function closestKey(key: string, candidates: string[]): string | undefined {
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = levenshtein(key.toLowerCase(), candidate.toLowerCase());
    if (distance <= 2 && (best === undefined || distance < best.distance))
      best = { candidate, distance };
  }
  return best?.candidate;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}

function credentialSourceDiagnostics(value: CapabilitiesYml, manifestPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  value.capabilities.forEach((entry, index) => {
    if (entry.source.kind !== "git") return;
    const problem = sourceUrlCredentialProblem(entry.source.url);
    if (problem === null) return;
    diagnostics.push({
      severity: "error",
      code: CREDENTIAL_IN_URL,
      message: problem,
      path: manifestPath,
      data: { index },
    });
  });
  return diagnostics;
}

function duplicateEntryDiagnostics(value: CapabilitiesYml, manifestDir: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of value.capabilities) {
    const id = entrySourceId(entry, manifestDir);
    if (seen.has(id)) {
      diagnostics.push({
        severity: "error",
        code: "acf.capabilities-yml.duplicate-entry",
        message: `duplicate capabilities.yml source: ${id}`,
        path: manifestDir,
        data: { sourceId: id },
      });
    }
    seen.add(id);
  }
  return diagnostics;
}

function emptyCapabilitiesYml(): CapabilitiesYml {
  return { acf: 1, capabilities: [] };
}

function isSelector(value: unknown): value is NonNullable<CapabilityEntry["include"]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (item) => Array.isArray(item) && item.every((name) => typeof name === "string"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
