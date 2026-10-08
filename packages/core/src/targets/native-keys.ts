/**
 * Classified native keys per target (capability-model-layers, Native key classification).
 *
 * Lists every skill frontmatter key, MCP server key and plugin-manifest key that the research
 * inventories record for Claude, Codex, Cursor, OpenCode and Pi. Readers and the extras
 * validator use the class to decide whether an untranslated key may be dropped (descriptive,
 * granting, functional) or blocks the component (restricting). `generatedFrom` marks keys a
 * writer derives from a core field; `pending` names the future core field of a pending
 * meaning (design D17).
 */
import type { InteropFamily, NativeKeyInfo, SafetyClass } from "../types/interop.js";
import type { TargetId } from "../types/model.js";

/**
 * Future core fields for meanings that stay pending in this change (canonical-skills and
 * canonical-mcp, Pending core meanings; design D17), mapped to the meaning they stand for.
 * Names promised by `canonical-skill-mcp-extensions` are used where that change fixes them;
 * the rest are working names that `acf.core.pending` reports until a change promotes them.
 */
export const pendingCoreFields: Readonly<Record<string, string>> = {
  "skill.display-name": "skill display name",
  "skill.paths": "path-scoped activation",
  "skill.allowed-tools": "tool pre-approval",
  "skill.arguments": "declared arguments and body placeholders",
  "skill.context": "isolated execution",
  "skill.agent": "agent coupling",
  "skill.requires.mcp": "MCP requirements",
  "mcp.enabled": "server enablement",
  "mcp.tools.enabled": "tool allowlist",
  "mcp.tools.disabled": "tool denylist",
  "mcp.timeouts.startupMs": "startup timeout",
  "mcp.timeouts.toolMs": "tool timeout",
  "mcp.envFile": "environment file",
  "mcp.transport=socket": "Unix-socket transport",
  "mcp.headersHelper": "computed headers",
  "mcp.oauth": "OAuth settings",
  "mcp.tools.autoApprove": "tool auto-approval",
  "mcp.tools.loading": "deferred-loading and promotion hints",
  "mcp.watch": "watch-restart",
  "mcp.valueReferences": "references to host environment variables, files or user options",
  "package.display-name": "package display name",
  "package.dependencies": "package dependencies",
  "package.userConfig": "user configuration options",
};

type KeySpec = {
  class: SafetyClass;
  generatedFrom?: string;
  pending?: string;
};

const descriptive: KeySpec = { class: "descriptive" };
const functional: KeySpec = { class: "functional" };
const restricting: KeySpec = { class: "restricting" };
const gen = (safety: SafetyClass, field: string): KeySpec => ({
  class: safety,
  generatedFrom: field,
});
const pend = (safety: SafetyClass, field: string): KeySpec => ({ class: safety, pending: field });

/** Skill keys every Agent Skills reader shares, written from core fields. */
const AGENT_SKILLS_KEYS = {
  name: gen("functional", "skill.name"),
  description: gen("functional", "skill.description"),
  license: gen("descriptive", "skill.license"),
  compatibility: gen("descriptive", "skill.compatibility"),
  metadata: gen("descriptive", "skill.metadata"),
} satisfies Record<string, KeySpec>;

const skillKeys: Record<TargetId, Record<string, KeySpec>> = {
  // claude-code.md, Frontmatter inventory.
  claude: {
    ...AGENT_SKILLS_KEYS,
    when_to_use: descriptive,
    "argument-hint": gen("descriptive", "skill.argument-hint"),
    arguments: pend("functional", "skill.arguments"),
    "disable-model-invocation": gen("restricting", "skill.invocation.model=false"),
    "user-invocable": gen("restricting", "skill.invocation.user=false"),
    "allowed-tools": pend("granting", "skill.allowed-tools"),
    "disallowed-tools": restricting,
    model: functional,
    effort: functional,
    context: pend("functional", "skill.context"),
    agent: pend("functional", "skill.agent"),
    background: functional,
    // Skill hooks can block tool calls, so dropping them could widen what the agent may do.
    hooks: restricting,
    paths: pend("restricting", "skill.paths"),
    shell: functional,
  },
  // codex.md, SKILL.md and agents/openai.yaml; openai.yaml keys are dotted paths.
  codex: {
    ...AGENT_SKILLS_KEYS,
    "allowed-tools": pend("granting", "skill.allowed-tools"),
    "interface.display_name": pend("descriptive", "skill.display-name"),
    "interface.short_description": descriptive,
    "interface.icon_small": descriptive,
    "interface.icon_large": descriptive,
    "interface.brand_color": descriptive,
    "interface.default_prompt": descriptive,
    "policy.allow_implicit_invocation": gen("restricting", "skill.invocation.model=false"),
    "dependencies.tools": pend("functional", "skill.requires.mcp"),
  },
  // cursor.md, SKILL.md YAML frontmatter.
  cursor: {
    ...AGENT_SKILLS_KEYS,
    paths: pend("restricting", "skill.paths"),
    globs: pend("restricting", "skill.paths"),
    "disable-model-invocation": gen("restricting", "skill.invocation.model=false"),
    icon: descriptive,
    color: descriptive,
  },
  // opencode.md, Skills: other keys are ignored by the loader.
  opencode: { ...AGENT_SKILLS_KEYS },
  // pi.md, Skills.
  pi: {
    ...AGENT_SKILLS_KEYS,
    "allowed-tools": pend("granting", "skill.allowed-tools"),
    "disable-model-invocation": gen("restricting", "skill.invocation.model=false"),
  },
};

const MCP_PROCESS_KEYS = {
  command: gen("functional", "mcp.command"),
  args: gen("functional", "mcp.args"),
  env: gen("functional", "mcp.env"),
  url: gen("functional", "mcp.url"),
} satisfies Record<string, KeySpec>;

const mcpKeys: Record<TargetId, Record<string, KeySpec>> = {
  // claude-code.md, Server fields.
  claude: {
    ...MCP_PROCESS_KEYS,
    type: gen("functional", "mcp.transport"),
    headers: gen("functional", "mcp.headers"),
    headersHelper: pend("functional", "mcp.headersHelper"),
    timeout: pend("functional", "mcp.timeouts.startupMs"),
    alwaysLoad: pend("descriptive", "mcp.tools.loading"),
    bareElicitationCapability: functional,
    oauth: pend("functional", "mcp.oauth"),
  },
  // codex.md, Native config.toml.
  codex: {
    ...MCP_PROCESS_KEYS,
    cwd: gen("functional", "mcp.cwd"),
    env_vars: pend("functional", "mcp.valueReferences"),
    experimental_environment: functional,
    auth: functional,
    bearer_token_env_var: pend("functional", "mcp.valueReferences"),
    http_headers: gen("functional", "mcp.headers"),
    env_http_headers: pend("functional", "mcp.valueReferences"),
    http_headers_helper: pend("functional", "mcp.headersHelper"),
    oauth_resource: pend("functional", "mcp.oauth"),
    oauth: pend("functional", "mcp.oauth"),
    scopes: pend("functional", "mcp.oauth"),
    startup_timeout_sec: pend("functional", "mcp.timeouts.startupMs"),
    startup_timeout_ms: pend("functional", "mcp.timeouts.startupMs"),
    tool_timeout_sec: pend("functional", "mcp.timeouts.toolMs"),
    enabled: pend("functional", "mcp.enabled"),
    required: functional,
    enabled_tools: pend("restricting", "mcp.tools.enabled"),
    disabled_tools: pend("restricting", "mcp.tools.disabled"),
    default_tools_approval_mode: pend("granting", "mcp.tools.autoApprove"),
    tools: pend("granting", "mcp.tools.autoApprove"),
  },
  // cursor.md, Files and fields.
  cursor: {
    ...MCP_PROCESS_KEYS,
    type: gen("functional", "mcp.transport"),
    envFile: pend("functional", "mcp.envFile"),
    // Not generated from core mcp.cwd: that cell is refused for loose Cursor output.
    cwd: functional,
    headers: gen("functional", "mcp.headers"),
    auth: pend("functional", "mcp.oauth"),
  },
  // opencode.md, MCP servers: args travel in the command array, env is `environment`.
  opencode: {
    type: gen("functional", "mcp.transport"),
    command: gen("functional", "mcp.command"),
    cwd: gen("functional", "mcp.cwd"),
    environment: gen("functional", "mcp.env"),
    url: gen("functional", "mcp.url"),
    headers: gen("functional", "mcp.headers"),
    enabled: pend("functional", "mcp.enabled"),
    timeout: pend("functional", "mcp.timeouts.startupMs"),
    oauth: pend("functional", "mcp.oauth"),
  },
  // facets/mcp.md: Pi MCP is the pi-mcp-adapter extension.
  pi: {
    ...MCP_PROCESS_KEYS,
    description: descriptive,
    cwd: gen("functional", "mcp.cwd"),
    headers: gen("functional", "mcp.headers"),
    oauth: pend("functional", "mcp.oauth"),
    auth: pend("functional", "mcp.oauth"),
    bearerToken: functional,
    bearerTokenEnv: pend("functional", "mcp.valueReferences"),
    excludeTools: pend("restricting", "mcp.tools.disabled"),
    directTools: pend("descriptive", "mcp.tools.loading"),
    promotedTools: pend("descriptive", "mcp.tools.loading"),
    lifecycle: functional,
    idleTimeout: functional,
    exposeResources: functional,
    toolOverrides: functional,
    debug: descriptive,
  },
};

/** Manifest metadata keys most plugin formats share; descriptive and not written from core. */
const LISTING_KEYS = {
  name: descriptive,
  version: descriptive,
  description: descriptive,
  author: descriptive,
  homepage: descriptive,
  repository: descriptive,
  license: descriptive,
  keywords: descriptive,
} satisfies Record<string, KeySpec>;

const packageKeys: Record<TargetId, Record<string, KeySpec>> = {
  // claude-code.md, Plugin layout and manifest.
  claude: {
    name: gen("descriptive", "package.name"),
    version: gen("descriptive", "package.version"),
    description: gen("descriptive", "package.description"),
    author: gen("descriptive", "package.authors"),
    homepage: gen("descriptive", "package.homepage"),
    repository: gen("descriptive", "package.repository"),
    license: gen("descriptive", "package.license"),
    keywords: gen("descriptive", "package.keywords"),
    $schema: descriptive,
    displayName: pend("descriptive", "package.display-name"),
    metadata: descriptive,
    icon: descriptive,
    documentationUrl: descriptive,
    supportUrl: descriptive,
    privacyPolicyUrl: descriptive,
    termsOfServiceUrl: descriptive,
    defaultEnabled: functional,
    dependencies: pend("functional", "package.dependencies"),
    settings: functional,
    userConfig: pend("functional", "package.userConfig"),
    types: descriptive,
    channels: functional,
    skills: functional,
    commands: functional,
    agents: functional,
    // Plugin hooks can block tool calls (guard hooks), so dropping them could widen behavior.
    hooks: restricting,
    mcpServers: functional,
    lspServers: functional,
    outputStyles: functional,
    workflows: functional,
    experimental: functional,
    themes: descriptive,
    monitors: functional,
  },
  // codex.md, Portable manifest and OpenAI extension and compatibility manifest.
  codex: {
    ...LISTING_KEYS,
    $schema: descriptive,
    extensions: functional,
    interface: descriptive,
    id: descriptive,
    apps: functional,
    hooks: restricting,
    skills: functional,
    mcpServers: functional,
  },
  // cursor.md, Cursor Plugin manifest: .cursor-plugin/plugin.json.
  cursor: {
    ...LISTING_KEYS,
    logo: descriptive,
    rules: functional,
    agents: functional,
    skills: functional,
    commands: functional,
    hooks: restricting,
    mcpServers: functional,
    variables: functional,
  },
  // opencode.md: OpenCode plugins are code modules without a manifest.
  opencode: {},
  // pi.md, Packaging, install and scopes: package.json fields Pi reads.
  pi: {
    name: descriptive,
    version: descriptive,
    keywords: descriptive,
    pi: functional,
    dependencies: pend("functional", "package.dependencies"),
    peerDependencies: functional,
    bundledDependencies: functional,
  },
};

function flatten(
  family: InteropFamily,
  table: Record<TargetId, Record<string, KeySpec>>,
): NativeKeyInfo[] {
  return Object.entries(table).flatMap(([target, keys]) =>
    Object.entries(keys).map(([key, spec]) => ({
      target,
      family,
      key,
      class: spec.class,
      ...(spec.generatedFrom === undefined ? {} : { generatedFrom: spec.generatedFrom }),
      ...(spec.pending === undefined ? {} : { pending: { coreField: spec.pending } }),
    })),
  );
}

/** Every classified native key, grouped by family and then target. */
export const nativeKeys: readonly NativeKeyInfo[] = [
  ...flatten("skill", skillKeys),
  ...flatten("mcp", mcpKeys),
  ...flatten("package", packageKeys),
];

const keyIndex = new Map(
  nativeKeys.map((info) => [`${info.target}\u0000${info.family}\u0000${info.key}`, info]),
);

/**
 * Classification of one native key. Returns undefined for a key the registry does not know;
 * callers treat that as `unclassified` (dropped with `acf.extras.dropped`, design D4).
 */
export function nativeKeyInfo(
  target: TargetId,
  family: InteropFamily,
  key: string,
): NativeKeyInfo | undefined {
  return keyIndex.get(`${target}\u0000${family}\u0000${key}`);
}
