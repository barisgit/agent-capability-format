import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type CapabilitiesYml,
  CREDENTIAL_IN_URL,
  capabilitiesYmlKnownKeys,
  capabilitiesYmlSchema,
  type Diagnostic,
  isErrno,
  parseYaml,
  pushZodIssues,
  sourceUrlCredentialProblem,
} from "@caplet/core";
import { entrySourceId } from "./lockfile.js";

/**
 * Reads and validates a scope's `capabilities.yml`. A missing file reads as an empty
 * manifest. Unparseable or invalid content, or a source URL carrying credentials, yields
 * error diagnostics and an empty manifest, so nothing from it is used; duplicate source
 * entries are reported and kept.
 */
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

  const parsed = capabilitiesYmlSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    describeUnknownKeys(parsed.error.issues);
    pushZodIssues(diagnostics, parsed.error, manifestPath, {
      baseCode: "acf.capabilities-yml.invalid",
      unknownKeyCode: "acf.capabilities-yml.unknown-key",
    });
    return { value: emptyCapabilitiesYml(), diagnostics };
  }

  const value = parsed.data as CapabilitiesYml;
  const credentialDiagnostics = credentialSourceDiagnostics(value, manifestPath);
  if (credentialDiagnostics.length > 0) {
    // Nothing from this manifest is used: any later message naming the entry could echo it.
    return { value: emptyCapabilitiesYml(), diagnostics: credentialDiagnostics };
  }
  diagnostics.push(...duplicateEntryDiagnostics(value, path.dirname(manifestPath)));
  return { value, diagnostics };
}

function describeUnknownKeys(
  issues: { code: string; keys?: string[]; path: PropertyKey[]; message: string }[],
): void {
  for (const issue of issues) {
    if (issue.code !== "unrecognized_keys" || issue.keys === undefined) continue;
    const pathKey = issue.path
      .filter((segment): segment is string => typeof segment === "string")
      .join(".");
    const knownKeys = capabilitiesYmlKnownKeys[pathKey] ?? [];
    issue.message = issue.keys
      .map((key) => {
        const suggestion = closestKey(key, knownKeys);
        const hint = suggestion === undefined ? "" : ` — did you mean "${suggestion}"?`;
        return `unknown key "${key}"${hint}`;
      })
      .join("; ");
  }
}

function closestKey(key: string, candidates: readonly string[]): string | undefined {
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
