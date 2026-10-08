import type {
  AcfCapability,
  AgentFacet,
  CanonicalHookType,
  CanonicalTriggerName,
  CommandFacet,
  Diagnostic,
  HookEffect,
  HookEntry,
  HookMatch,
  HookRun,
  InstructionActivation,
  InstructionFacet,
  McpServer,
  Scope,
  SkillFacet,
  TargetExtensions,
  TargetId,
} from "@caplet/core";

export type SkillView = {
  name: string;
  capability: string;
  scope: Scope;
  description: string;
  body: string;
  targetExtensions?: unknown;
  diagnostics?: Diagnostic[];
};

export type AgentView = {
  name: string;
  capability: string;
  scope: Scope;
  description: string;
  body: string;
  mode?: "primary" | "subagent" | "all";
  model?: "inherit";
  targetExtensions?: unknown;
  diagnostics?: Diagnostic[];
};

export type CommandView = {
  name: string;
  capability: string;
  scope: Scope;
  description: string;
  body: string;
  arguments?: string[];
  agent?: string;
  targetExtensions?: unknown;
  diagnostics?: Diagnostic[];
};

export type InstructionView = {
  name: string;
  capability: string;
  scope: Scope;
  description: string;
  body: string;
  activation: InstructionActivation;
  targetExtensions?: unknown;
  diagnostics?: Diagnostic[];
};

export type HookView = {
  name: string;
  capability: string;
  scope: Scope;
  hookType: CanonicalHookType;
  run: HookRun;
  effect: HookEffect;
  description?: string;
  match?: HookMatch;
  timeout?: number;
  targetExtensions?: unknown;
  diagnostics?: Diagnostic[];
};

export type McpServerView = {
  name: string;
  capability: string;
  scope: Scope;
  transport: McpServer["transport"];
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  targetExtensions?: unknown;
  diagnostics?: Diagnostic[];
};

export type FacetBundle = {
  skills: SkillView[];
  agents: AgentView[];
  commands: CommandView[];
  instructions: InstructionView[];
  hooks: HookView[];
  mcpServers: McpServerView[];
};

export function toFacetBundle(
  capabilities: readonly AcfCapability[],
  opts: { target: TargetId; includeDiagnostics: boolean },
): FacetBundle {
  return {
    skills: capabilities.flatMap((capability) =>
      capability.skills.map((facet) => skillView(capability, facet, opts)),
    ),
    agents: capabilities.flatMap((capability) =>
      capability.agents.map((facet) => agentView(capability, facet, opts)),
    ),
    commands: capabilities.flatMap((capability) =>
      capability.commands.map((facet) => commandView(capability, facet, opts)),
    ),
    instructions: capabilities.flatMap((capability) =>
      capability.instructions.map((facet) => instructionView(capability, facet, opts)),
    ),
    hooks: capabilities.flatMap((capability) => hookViews(capability, opts)),
    mcpServers: capabilities.flatMap((capability) => mcpServerViews(capability, opts)),
  };
}

export function matchesTrigger(view: InstructionView, trigger: CanonicalTriggerName): boolean {
  if (view.activation === "always") return true;
  return view.activation.when[trigger] !== undefined;
}

function skillView(
  capability: AcfCapability,
  facet: SkillFacet,
  opts: { target: TargetId; includeDiagnostics: boolean },
): SkillView {
  const view: SkillView = {
    name: facet.name,
    capability: capability.manifest.name,
    scope: capability.scope,
    description: facet.frontmatter.description,
    body: facet.body,
  };
  addTargetExtensions(view, facet.frontmatter.targets, opts.target);
  addDiagnostics(
    view,
    diagnosticsFor(capability, "skill", facet.primaryFile),
    opts.includeDiagnostics,
  );
  return view;
}

function agentView(
  capability: AcfCapability,
  facet: AgentFacet,
  opts: { target: TargetId; includeDiagnostics: boolean },
): AgentView {
  const view: AgentView = {
    name: facet.name,
    capability: capability.manifest.name,
    scope: capability.scope,
    description: facet.frontmatter.description,
    body: facet.body,
  };
  if (facet.frontmatter.mode !== undefined) view.mode = facet.frontmatter.mode;
  if (facet.frontmatter.model !== undefined) view.model = facet.frontmatter.model;
  addTargetExtensions(view, facet.frontmatter.targets, opts.target);
  addDiagnostics(
    view,
    diagnosticsFor(capability, "agent", facet.source.primary),
    opts.includeDiagnostics,
  );
  return view;
}

function commandView(
  capability: AcfCapability,
  facet: CommandFacet,
  opts: { target: TargetId; includeDiagnostics: boolean },
): CommandView {
  const view: CommandView = {
    name: facet.name,
    capability: capability.manifest.name,
    scope: capability.scope,
    description: facet.frontmatter.description,
    body: facet.body,
  };
  if (facet.frontmatter.arguments !== undefined) view.arguments = facet.frontmatter.arguments;
  if (facet.frontmatter.agent !== undefined) view.agent = facet.frontmatter.agent;
  addTargetExtensions(view, facet.frontmatter.targets, opts.target);
  addDiagnostics(
    view,
    diagnosticsFor(capability, "command", facet.source.primary),
    opts.includeDiagnostics,
  );
  return view;
}

function instructionView(
  capability: AcfCapability,
  facet: InstructionFacet,
  opts: { target: TargetId; includeDiagnostics: boolean },
): InstructionView {
  const view: InstructionView = {
    name: facet.name,
    capability: capability.manifest.name,
    scope: capability.scope,
    description: facet.frontmatter.description,
    body: facet.body,
    activation: facet.frontmatter.activation,
  };
  addTargetExtensions(view, facet.frontmatter.targets, opts.target);
  addDiagnostics(
    view,
    diagnosticsFor(capability, "instruction", facet.source.primary),
    opts.includeDiagnostics,
  );
  return view;
}

function hookViews(
  capability: AcfCapability,
  opts: { target: TargetId; includeDiagnostics: boolean },
): HookView[] {
  const hooks = capability.hooks;
  if (hooks === undefined) return [];
  const views: HookView[] = [];
  for (const [hookType, entries] of Object.entries(hooks.buckets) as Array<
    [CanonicalHookType, HookEntry[] | undefined]
  >) {
    for (const entry of entries ?? []) {
      const view: HookView = {
        name: entry.name,
        capability: capability.manifest.name,
        scope: capability.scope,
        hookType,
        run: entry.run,
        effect: entry.effect,
      };
      if (entry.description !== undefined) view.description = entry.description;
      if (entry.match !== undefined) view.match = entry.match;
      if (entry.timeout !== undefined) view.timeout = entry.timeout;
      addTargetExtensions(view, entry.targets, opts.target);
      addDiagnostics(view, diagnosticsFor(capability, "hook", hooks.path), opts.includeDiagnostics);
      views.push(view);
    }
  }
  return views;
}

function mcpServerViews(
  capability: AcfCapability,
  opts: { target: TargetId; includeDiagnostics: boolean },
): McpServerView[] {
  const mcp = capability.mcp;
  if (mcp === undefined) return [];
  return mcp.servers.map((server) => {
    const view: McpServerView = {
      name: server.name,
      capability: capability.manifest.name,
      scope: capability.scope,
      transport: server.transport,
    };
    if (server.description !== undefined) view.description = server.description;
    if (server.transport === "stdio") {
      view.command = server.command;
      if (server.args !== undefined) view.args = server.args;
      if (server.env !== undefined) view.env = server.env;
    } else {
      view.url = server.url;
      if (server.headers !== undefined) view.headers = server.headers;
    }
    addTargetExtensions(view, server.targets, opts.target);
    addDiagnostics(view, diagnosticsFor(capability, "mcp", mcp.path), opts.includeDiagnostics);
    return view;
  });
}

function diagnosticsFor(
  capability: AcfCapability,
  family: "skill" | "agent" | "command" | "instruction" | "hook" | "mcp",
  primaryPath: string,
): Diagnostic[] {
  return capability.diagnostics.filter(
    (diagnostic) =>
      diagnostic.path === primaryPath ||
      (diagnostic.family === family && diagnostic.path === undefined) ||
      diagnostic.capability?.name === capability.manifest.name,
  );
}

function addTargetExtensions(
  view: { targetExtensions?: unknown },
  targets: TargetExtensions | undefined,
  target: TargetId,
): void {
  const extension = targets?.[target];
  if (extension !== undefined) view.targetExtensions = extension;
}

function addDiagnostics(
  view: { diagnostics?: Diagnostic[] },
  diagnostics: Diagnostic[],
  includeDiagnostics: boolean,
): void {
  if (includeDiagnostics) view.diagnostics = diagnostics;
}
