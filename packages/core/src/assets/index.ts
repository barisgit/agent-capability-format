import path from "node:path";
import type {
  AcfCapability,
  AgentFacet,
  AssetRef,
  CapabilityMarkdown,
  CommandFacet,
  Diagnostic,
  InstructionFacet,
  SkillFacet,
} from "../types";
import { exists } from "../utils/fs";

export type AssetInput = Pick<
  AcfCapability,
  "root" | "capabilityMarkdown" | "skills" | "agents" | "commands" | "instructions" | "diagnostics"
>;

type PendingRef = AssetRef & { baseDir: string; rawPath: string };

export async function collectReferencedAssets(input: AssetInput): Promise<AssetRef[]> {
  const pending: PendingRef[] = [];
  const capMd = input.capabilityMarkdown;
  if (capMd !== undefined) {
    pushMarkdownAssets(capMd, { family: "capability" }, pending);
  }
  for (const skill of input.skills) pushSkillAssets(skill, pending);
  for (const facet of [...input.agents, ...input.commands, ...input.instructions]) {
    pushProseAssets(facet, pending);
  }
  return await validateAndNormalize(input.root, pending, input.diagnostics);
}

function pushSkillAssets(facet: SkillFacet, refs: PendingRef[]): void {
  const marker = { family: facet.family, name: facet.name } as const;
  pushExplicitAssets(facet.frontmatter.assets, facet.dir, marker, refs);
  pushMarkdownAssets({ path: facet.primaryFile, body: facet.body }, marker, refs);
}

function pushProseAssets(
  facet: AgentFacet | CommandFacet | InstructionFacet,
  refs: PendingRef[],
): void {
  const marker = { family: facet.family, name: facet.name } as const;
  const explicitBase =
    facet.source.kind === "directory" ? facet.source.path : path.dirname(facet.source.primary);
  pushExplicitAssets(facet.frontmatter.assets, explicitBase, marker, refs);
  pushMarkdownAssets({ path: facet.source.primary, body: facet.body }, marker, refs);
}

function pushExplicitAssets(
  assets: string[] | undefined,
  baseDir: string,
  facet: AssetRef["facet"],
  refs: PendingRef[],
): void {
  for (const rawPath of assets ?? []) {
    refs.push({ path: rawPath, rawPath, baseDir, origin: "frontmatter", facet });
  }
}

function pushMarkdownAssets(
  source: Pick<CapabilityMarkdown, "path" | "body">,
  facet: AssetRef["facet"],
  refs: PendingRef[],
): void {
  const baseDir = path.dirname(source.path);
  for (const rawPath of markdownLocalRefs(source.body)) {
    refs.push({ path: rawPath, rawPath, baseDir, origin: "markdown", facet });
  }
}

function markdownLocalRefs(markdown: string): string[] {
  const refs: string[] = [];
  const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const raw = match[1];
    if (raw === undefined || isRemoteRef(raw) || raw.startsWith("#")) continue;
    refs.push(raw);
  }
  return refs;
}

async function validateAndNormalize(
  root: string,
  refs: PendingRef[],
  diagnostics: Diagnostic[],
): Promise<AssetRef[]> {
  const out: AssetRef[] = [];
  const seen = new Set<string>();
  const absRoot = path.resolve(root);
  for (const ref of refs) {
    const cleanRaw = ref.rawPath.split("#")[0]?.split("?")[0] ?? ref.rawPath;
    if (isRemoteRef(cleanRaw)) continue;
    if (path.isAbsolute(cleanRaw)) {
      diagnostics.push({
        severity: "error",
        code: "acf.path.absolute",
        message: `absolute asset path is invalid: ${ref.rawPath}`,
        path: ref.rawPath,
      });
      continue;
    }
    if (cleanRaw.includes("\\")) {
      diagnostics.push({
        severity: "error",
        code: "acf.path.traversal",
        message: `asset paths must use forward slashes: ${ref.rawPath}`,
        path: ref.rawPath,
      });
      continue;
    }
    const abs = path.resolve(ref.baseDir, cleanRaw);
    if (!isInside(absRoot, abs)) {
      diagnostics.push({
        severity: "error",
        code: "acf.path.traversal",
        message: `asset path escapes capability root: ${ref.rawPath}`,
        path: ref.rawPath,
      });
      continue;
    }
    if (!(await exists(abs))) {
      diagnostics.push({
        severity: "error",
        code: "acf.path.traversal",
        message: `asset file does not exist: ${ref.rawPath}`,
        path: ref.rawPath,
      });
      continue;
    }
    const rel = path.relative(absRoot, abs).split(path.sep).join("/").normalize("NFC");
    const normalized: AssetRef = { path: rel, origin: ref.origin, facet: ref.facet };
    const key = `${normalized.path}\0${normalized.origin}\0${normalized.facet.family}\0${"name" in normalized.facet ? normalized.facet.name : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.origin.localeCompare(b.origin));
}

function isRemoteRef(raw: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
