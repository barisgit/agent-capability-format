/**
 * Validation of authored extras (capability-model-layers, Inline native extras and File-level
 * native extras; canonical-package-metadata, Per-target package values). The target extension
 * schemas check the shape; this module classifies each native key through the registry, checks
 * known native values and per-target package values in the target's own value domain, and
 * rejects `native/<target>/`
 * files that would overwrite generated plugin output.
 */
import path from "node:path";
import { applicableTargets } from "../applicability/index.js";
import {
  NATIVE_FILES_DIR,
  nativeExtras,
  nativeFiles,
  nativeFileTargets,
  packageValues,
} from "../extras/index.js";
import {
  corePending,
  generatedPathCollision,
  generatedPluginPaths,
  isTargetId,
  nativeKeyInfo,
  nativeValueProblem,
  packageValueProblem,
  packageValueSchemas,
} from "../targets/index.js";
import type {
  AcfCapability,
  Diagnostic,
  InteropFamily,
  TargetExtensions,
  TargetId,
} from "../types/index.js";
import { manifestFile } from "./helpers.js";

/** A place that accepts `targets.<target>.native`: the package, one skill or one server. */
type AttachmentPoint = {
  family: InteropFamily;
  component: string;
  targets: TargetExtensions | undefined;
  file: string | undefined;
};

function attachmentPoints(cap: AcfCapability): AttachmentPoint[] {
  return [
    {
      family: "package",
      component: cap.manifest.name,
      targets: cap.manifest.targets,
      file: manifestFile(cap),
    },
    ...cap.skills.map((skill) => ({
      family: "skill" as const,
      component: skill.name,
      targets: skill.frontmatter.targets,
      file: skill.primaryFile,
    })),
    ...(cap.mcp?.servers ?? []).map((server) => ({
      family: "mcp" as const,
      component: server.name,
      targets: server.targets,
      file: cap.mcp?.path,
    })),
  ];
}

/**
 * Classifies every inline native key and checks every per-target package value. Unknown keys
 * are accepted with `acf.extras.unclassified` (info), keys a writer generates from a core field
 * are `acf.extras.conflict` (error), known keys with a value outside their native domain are
 * `acf.extras.native-value-invalid` (error), keys carrying a pending meaning report
 * `acf.core.pending` (info), and package values outside the target's domain are
 * `acf.extras.package-value-invalid`.
 */
export function validateInlineExtras(cap: AcfCapability): void {
  validateNativeKeys(cap);
  validatePackageValues(cap);
}

function validateNativeKeys(cap: AcfCapability): void {
  for (const point of attachmentPoints(cap)) {
    for (const target of Object.keys(point.targets ?? {}).filter(isTargetId)) {
      for (const [key, value] of Object.entries(nativeExtras(point.targets, target))) {
        const diagnostic = nativeKeyDiagnostic(cap, point, target, key, value);
        if (diagnostic !== undefined) cap.diagnostics.push(diagnostic);
      }
    }
  }
}

function validatePackageValues(cap: AcfCapability): void {
  for (const target of Object.keys(cap.manifest.targets ?? {}).filter(isTargetId)) {
    for (const [key, value] of Object.entries(packageValues(cap.manifest, target))) {
      const problem = packageValueProblem(target, key, value);
      if (problem === undefined) continue;
      cap.diagnostics.push({
        severity: "error",
        code: "acf.extras.package-value-invalid",
        message: `targets.${target}.package.${key}: ${problem}`,
        path: manifestFile(cap),
        targetId: target,
      });
    }
  }
}

function nativeKeyDiagnostic(
  cap: AcfCapability,
  point: AttachmentPoint,
  target: TargetId,
  key: string,
  value: unknown,
): Diagnostic | undefined {
  const source = `targets.${target}.native.${key}`;
  const family = point.family === "package" ? undefined : point.family;
  const label = point.family === "package" ? "the package" : `${point.family} ${point.component}`;
  const info = nativeKeyInfo(target, point.family, key);
  if (info === undefined) {
    return {
      severity: "info",
      code: "acf.extras.unclassified",
      message: `${source} on ${label} is not a known ${target} key; it is written to ${target} verbatim and dropped for other targets`,
      path: point.file,
      targetId: target,
      family,
    };
  }
  if (info.generatedFrom !== undefined) {
    const instead =
      point.family === "package" && packageValueSchemas[target]?.[key] !== undefined
        ? `set targets.${target}.package.${key} for a ${target}-only value`
        : `set ${info.generatedFrom} instead`;
    return {
      severity: "error",
      code: "acf.extras.conflict",
      message: `${source} on ${label} conflicts with ${info.generatedFrom}, from which ${target} writes ${key}; ${instead}`,
      path: point.file,
      targetId: target,
      family,
    };
  }
  const problem = nativeValueProblem(target, point.family, key, value);
  if (problem !== undefined) {
    return {
      severity: "error",
      code: "acf.extras.native-value-invalid",
      message: `${source} on ${label} is not a valid ${target} value: ${problem}`,
      path: point.file,
      targetId: target,
      family,
    };
  }
  const pending = corePending(
    { capability: cap.manifest.name, target, family: point.family, component: point.component },
    key,
  );
  return pending === undefined ? undefined : { ...pending, path: point.file };
}

/**
 * Rejects `native/<target>/` files that would overwrite a path the target's plugin writer
 * generates for this capability (`acf.native.collision`, error). Targets the capability does
 * not apply to, and targets without a plugin carrier, never receive the tree.
 */
export function validateNativeFileCollisions(cap: AcfCapability): void {
  for (const target of nativeFileTargets(cap)) {
    if (!applicableTargets(cap, {}).includes(target)) continue;
    const generated = generatedPluginPaths(target, {
      skills: cap.skills
        .filter((skill) => applicableTargets(cap, skill.frontmatter).includes(target))
        .map((skill) => skill.name),
      mcp: (cap.mcp?.servers ?? []).some((server) =>
        applicableTargets(cap, server).includes(target),
      ),
    });
    for (const file of nativeFiles(cap, target)) {
      const collision = generatedPathCollision(generated, file.path);
      if (collision === undefined) continue;
      const source = `${NATIVE_FILES_DIR}/${target}/${file.path}`;
      cap.diagnostics.push({
        severity: "error",
        code: "acf.native.collision",
        message: `${source} collides with ${collision}, which the ${target} plugin writer generates; set manifest values through targets.${target}.native or targets.${target}.package`,
        path: path.join(cap.root, source),
        targetId: target,
      });
    }
  }
}
