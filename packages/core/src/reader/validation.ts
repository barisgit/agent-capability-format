import path from "node:path";
import {
  type CanonicalHookType,
  type CanonicalTriggerName,
  isProvisionalOperation,
} from "@caplet/runtime-taxonomy";
import { applicableTargets } from "../applicability/index.js";
import { makeDiagnostic } from "../diagnostics/index.js";
import { isTargetId, targetMap } from "../targets/index.js";
import type {
  AcfCapability,
  Diagnostic,
  FacetFamily,
  HookEntry,
  HookMatch,
  TargetExtensions,
} from "../types/index.js";
import { hookEffectMatrix, hookMatchRequired } from "../types/index.js";
import { counts } from "./helpers.js";

export function validateCapability(cap: AcfCapability): void {
  validateUniqueFacetNames(cap);
  validateHookFile(cap);
  validateOnlyExceptTargets(cap);
  validateTargetExtensions(cap);
  validateActivationConstraints(cap);
  validateApplicability(cap);
}

function validateHookFile(cap: AcfCapability): void {
  const hooks = cap.hooks;
  if (hooks === undefined) return;
  for (const [type, entries] of Object.entries(hooks.buckets) as Array<
    [CanonicalHookType, HookEntry[] | undefined]
  >) {
    for (const entry of entries ?? []) {
      if (!hookEffectMatrix[type].includes(entry.effect)) {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.hook.effect.not-allowed",
          message: `effect ${entry.effect} is not allowed for ${type}`,
          path: hooks.path,
          family: "hook",
        });
      }
      if (hookMatchRequired.has(type) && isEmptyMatch(entry.match)) {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.hook.match.required",
          message: `${type} entries require a non-empty match`,
          path: hooks.path,
          family: "hook",
        });
      }
      validateMatch(entry.match, hooks.path, cap.diagnostics);
      if (entry.run.args !== undefined && entry.run.shell !== undefined) {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.hook.run.args-and-shell",
          message: "args and shell are mutually exclusive",
          path: hooks.path,
          family: "hook",
        });
      }
    }
  }
}

function validateMatch(
  match: HookMatch | undefined,
  file: string,
  diagnostics: Diagnostic[],
): void {
  if (match?.operation !== undefined && !isProvisionalOperation(match.operation)) {
    diagnostics.push({
      severity: "error",
      code: "acf.runtime.unknown-operation",
      message: `unknown operation: ${match.operation}`,
      path: file,
    });
  }
  for (const pattern of match?.conditions ?? []) validateRegex(pattern, file, diagnostics);
  for (const glob of match?.paths ?? []) validateRelativePath(glob, file, diagnostics);
}

function validateActivationConstraints(cap: AcfCapability): void {
  for (const inst of cap.instructions) {
    const act = inst.frontmatter.activation;
    if (act === "always") continue;
    for (const [name, trigger] of Object.entries(act.when) as Array<
      [CanonicalTriggerName, ActivationCheck | undefined]
    >) {
      if (trigger === undefined) continue;
      if (trigger.debounce !== undefined && trigger.repeat !== "always") {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.instruction.debounce.requires-repeat-always",
          message: `debounce is only allowed when repeat is always (${name})`,
          path: inst.source.primary,
          family: "instruction",
        });
      }
      for (const condition of trigger.conditions ?? []) {
        validateRegex(condition, inst.source.primary, cap.diagnostics);
      }
      for (const glob of trigger.paths ?? []) {
        validateRelativePath(glob, inst.source.primary, cap.diagnostics);
      }
      for (const scope of trigger.scope ?? []) {
        if (scope.operation !== undefined && !isProvisionalOperation(scope.operation)) {
          cap.diagnostics.push({
            severity: "error",
            code: "acf.runtime.unknown-operation",
            message: `unknown operation: ${scope.operation}`,
            path: inst.source.primary,
            family: "instruction",
          });
        }
        for (const glob of scope.paths ?? []) {
          validateRelativePath(glob, inst.source.primary, cap.diagnostics);
        }
      }
    }
  }
}

type ActivationCheck = {
  debounce?: number;
  repeat?: string;
  conditions?: string[];
  paths?: string[];
  scope?: Array<{ operation?: string; paths?: string[] }>;
};

function validateOnlyExceptTargets(cap: AcfCapability): void {
  const decls: Array<{
    only?: string[] | undefined;
    except?: string[] | undefined;
    path?: string | undefined;
    family?: FacetFamily | undefined;
  }> = [{ ...cap.manifest, path: path.join(cap.root, "acf.yml") }];
  for (const facet of [...cap.skills, ...cap.agents, ...cap.commands, ...cap.instructions]) {
    decls.push({
      ...facet.frontmatter,
      path: "source" in facet ? facet.source.primary : facet.primaryFile,
      family: facet.family,
    });
  }
  for (const entries of Object.values(cap.hooks?.buckets ?? {})) {
    for (const entry of entries ?? [])
      decls.push({ ...entry, path: cap.hooks?.path, family: "hook" });
  }
  for (const server of cap.mcp?.servers ?? []) {
    decls.push({ ...server, path: cap.mcp?.path, family: "mcp" });
  }
  for (const decl of decls) {
    for (const id of [...(decl.only ?? []), ...(decl.except ?? [])]) {
      if (!isTargetId(id)) {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.target.unknown-id",
          message: `unknown target id: ${id}`,
          path: decl.path,
          family: decl.family,
          targetId: id,
        });
      }
    }
  }
}

function validateTargetExtensions(cap: AcfCapability): void {
  const checks: Array<{
    family: FacetFamily | "capability";
    targets?: TargetExtensions | undefined;
    path?: string | undefined;
  }> = [
    { family: "capability", targets: cap.manifest.targets, path: path.join(cap.root, "acf.yml") },
  ];
  for (const facet of [...cap.skills, ...cap.agents, ...cap.commands, ...cap.instructions]) {
    checks.push({
      family: facet.family,
      targets: facet.frontmatter.targets,
      path: "source" in facet ? facet.source.primary : facet.primaryFile,
    });
  }
  for (const entry of Object.values(cap.hooks?.buckets ?? {}).flatMap((value) => value ?? [])) {
    checks.push({ family: "hook", targets: entry.targets, path: cap.hooks?.path });
  }
  for (const server of cap.mcp?.servers ?? []) {
    checks.push({ family: "mcp", targets: server.targets, path: cap.mcp?.path });
  }
  for (const check of checks)
    validateExtensions(check.family, check.targets, check.path, cap.diagnostics);
}

function validateExtensions(
  family: FacetFamily | "capability",
  targets: TargetExtensions | undefined,
  file: string | undefined,
  diagnostics: Diagnostic[],
): void {
  if (targets === undefined) return;
  for (const [id, payload] of Object.entries(targets)) {
    if (!isTargetId(id)) {
      diagnostics.push({
        severity: "error",
        code: "acf.target.unknown-id",
        message: `unknown target id: ${id}`,
        path: file,
        targetId: id,
      });
      continue;
    }
    const result = targetMap[id]?.extensions[family]?.safeParse(payload);
    if (result !== undefined && !result.success) {
      diagnostics.push(
        makeDiagnostic({
          severity: "error",
          code: "acf.target.extension.unknown-field",
          message: result.error.issues[0]?.message ?? "invalid target extension",
          path: file,
          targetId: id,
          family: family === "capability" ? undefined : family,
        }),
      );
    }
  }
}

function validateApplicability(cap: AcfCapability): void {
  for (const facet of [...cap.skills, ...cap.agents, ...cap.commands, ...cap.instructions]) {
    if (
      (facet.frontmatter.only !== undefined || facet.frontmatter.except !== undefined) &&
      applicableTargets(cap, facet.frontmatter).length === 0
    ) {
      cap.diagnostics.push({
        severity: "info",
        code: "acf.applicability.empty",
        message: `${facet.family} ${facet.name} applies to no targets`,
        family: facet.family,
      });
    }
  }
}

function validateUniqueFacetNames(cap: AcfCapability): void {
  for (const [family, names] of [
    ["skill", cap.skills.map((f) => f.name)],
    ["agent", cap.agents.map((f) => f.name)],
    ["command", cap.commands.map((f) => f.name)],
    ["instruction", cap.instructions.map((f) => f.name)],
  ] as const) {
    for (const [name, count] of counts(names)) {
      if (count > 1) {
        cap.diagnostics.push({
          severity: "error",
          code: "acf.facet.duplicate",
          message: `duplicate ${family}: ${name}`,
          family,
        });
      }
    }
  }
}

function validateRegex(pattern: string, file: string, diagnostics: Diagnostic[]): void {
  try {
    new RegExp(pattern);
  } catch {
    diagnostics.push({
      severity: "error",
      code: "acf.instruction.invalid-regex",
      message: `invalid regex: ${pattern}`,
      path: file,
    });
  }
}

function validateRelativePath(value: string, file: string, diagnostics: Diagnostic[]): void {
  if (path.isAbsolute(value)) {
    diagnostics.push({
      severity: "error",
      code: "acf.path.absolute",
      message: `absolute path is invalid: ${value}`,
      path: file,
    });
  }
}

function isEmptyMatch(match: HookMatch | undefined): boolean {
  return (
    match === undefined ||
    (match.operation === undefined &&
      (match.paths?.length ?? 0) === 0 &&
      (match.conditions?.length ?? 0) === 0)
  );
}
