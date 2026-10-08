# Facet: permissions, trust and security (snapshot 2026-10-01)

Cross-tool comparison and canonical-model proposal for permission rules, tool availability, approval posture, trust prompts, workspace trust, sandboxing, provenance, and managed policy. Evidence comes from the tool inventories in `../tools/*.md` (each cites its sources) plus the ACF sources listed in section 6. Claims checked again against primary sources during this pass:

- Claude Code plugin `settings` applies only `agent` and `subagentStatusLine`; other keys are dropped at load ([plugins reference](https://code.claude.com/docs/en/plugins-reference)). Confirmed.
- Claude Code project `permissions.allow` and `additionalDirectories` apply only after the workspace-trust dialog is accepted; `Agent(Name)` and `Skill(...)` rules exist; Edit rules cover all edit tools; allow rules accept tool-name globs only after a literal `mcp__<server>__` prefix ([permissions](https://code.claude.com/docs/en/permissions)). Confirmed.
- Gemini CLI loads extension `policies/*.toml` in the extension tier **and drops every `allow` rule and every rule scoped to `yolo` mode from extensions** (`loadExtensionPolicies` in `packages/core/src/policy/config.ts`, `main` branch, unpinned). The Gemini inventory does not record this filter; it changes what a package can grant there.

Tool columns used below: **Claude** (Claude Code), **Codex**, **Copilot** (Copilot CLI unless noted), **VS Code** (Local harness), **Cursor**, **OpenCode**, **Pi**, **AP/AS** (Agent Plugins 1.0 and Agent Skills, as package formats), **Gemini**, **Amp**, **Cascade** (Windsurf Cascade), **Devin** (Devin Local / Desktop), **Cline**, **Roo**, **Goose**, **Kiro**, **Lume**.

## 0. Framing: five meanings that tools spell alike

Almost every disagreement in this facet comes from collapsing these five meanings. The canonical model keeps them as separate fields:

| Meaning | Definition | Typical spellings | Direction |
|---|---|---|---|
| **Grant** (pre-approval) | Matching calls run without an approval prompt. Does not widen sandbox, filesystem, or network confinement. | skill `allowed-tools` (Claude, Copilot, Devin, AS), `permissions.allow`, MCP `autoApprove`/`alwaysAllow`, Cursor `mcpAllowlist`/`terminalAllowlist` | widens authority |
| **Rule** (call policy) | A matching call is allowed, needs approval, or is refused. | `permissions.{allow,ask,deny}` (Claude, Copilot managed, Devin, Kiro `effect`), OpenCode `permission`, Gemini `decision`, Codex `prefix_rule(decision=)` | narrows (ask/deny) or widens (allow) |
| **Availability** | Whether a tool is offered to the model at all, regardless of approval. | agent `tools` (Claude, Copilot, VS Code, Gemini, Kiro), Claude `disallowedTools`, Devin agent `allowed-tools`, Gemini `excludeTools`, MCP `includeTools`/`excludeTools`/`enabled_tools`/`disabledTools`/`tools` | narrows |
| **Posture** | A coarse mode for an agent or session. | Cursor `readonly`, Codex `sandbox_mode`, Claude `permissionMode`, Goose `GOOSE_MODE`, Devin modes | either |
| **Gate** | A consumer- or admin-owned check before package content activates. | workspace trust, install consent, hook review, MCP approval, managed policy | consumer-owned; never package-authored |

Provenance and integrity (source pins, digests, signatures) is a sixth concern that sits with the lockfile, not with package content.

## 1. Concept map

"Pkg" means the meaning can be authored inside a package that the tool installs as a unit (plugin, extension, skill dir, agent file). "Host" means it exists only in user, project, or admin configuration that a package does not own.

### 1.1 Package-authorable permission meanings

| # | Shared meaning | Tools and spellings (attachment) | Pkg/Host |
|---|---|---|---|
| M1 | Grant scoped to a skill's activity | Claude `allowed-tools` (string or list; turn-scoped); Copilot `allowed-tools` (string or list; "while active"; `"*"` = all); Devin skill `allowed-tools` (auto-approval, inline execution only) and `permissions.allow`; AS `allowed-tools` (experimental, space-delimited string). Parsed but unenforced or unknown: Codex, VS Code, Cursor, Cline, Pi, Lume, Goose, Gemini, OpenCode. Kiro Power Builder describes skill `allowed-tools` as a **restriction** (see C2). | Pkg |
| M2 | Grant scoped to a command | Claude commands are skills (`allowed-tools`; plugin manifest command map `allowedTools`); Copilot CLI command files `allowed-tools`. OpenCode commands: none. | Pkg |
| M3 | Ask/deny scoped to a skill's activity | Devin skill `permissions.ask/deny` (cannot override higher-level denials; ignored when the skill runs as a subagent). Claude skill `disallowed-tools` removes tools while the skill is active (availability, adjacent). | Pkg |
| M4 | Rules scoped to an agent | OpenCode agent `permission` (allow/ask/deny map, last match wins); Kiro agent `permissions.rules[]` (`capability`, `match`, `exclude`, `effect`); Gemini extension policy rule with `subagent = "<name>"` (deny/ask only, allow is filtered); Kiro `allowedTools` (no-prompt grant) and `toolsSettings.subagent.trustedAgents` (delegation grant). | Pkg |
| M5 | Agent tool availability allowlist | Claude `tools`; Copilot `tools` (aliases `execute`, `read`, `edit`, `search`, `agent`, `web`, `todo`; `server/tool`); VS Code `tools` (`<server>/*`), `agents` (delegate allowlist); Gemini `tools` (`*`, `mcp_<server>_*`); Kiro `tools` (`@builtin`, `@server/tool`, tags) and `toolsSettings.subagent.availableAgents`; Devin agent `allowed-tools`/`tools` (restricts); Roo mode `groups` (`read`, `edit`, `command`, `mcp`, `modes`); OpenCode legacy `tools` map (deprecated, normalized to `permission`). | Pkg |
| M6 | Agent tool availability denylist | Claude `disallowedTools` (a parameterized entry removes the whole tool); VS Code Claude-format `disallowedTools`; Kiro `excludedTools`; OpenCode `tools: {x: false}` (deprecated). | Pkg |
| M7 | Agent read-only posture | Cursor agent `readonly: true` (no edits, no state-changing shell); Codex agent TOML `sandbox_mode = "read-only"` (OS-enforced; live parent overrides are reapplied). Adjacent, not equal: Claude `permissionMode: plan` (planning workflow; ignored for plugin agents); Roo mode without `edit` group. | Pkg (agent file) |
| M8 | Package-wide rules while the package is enabled | Gemini extension `policies/*.toml` (deny/ask effective; allow and yolo rules dropped) and manifest `excludeTools`. No other plugin format carries package-wide rules. | Pkg (Gemini only) |
| M9 | Grant for tools of a server the package ships | Cline MCP `autoApprove: string[]`; Roo `alwaysAllow: string[]`; Kiro MCP `autoApprove` (`"*"` all; legacy powers and agent-local servers); Codex per-server `tools.<tool>.approval_mode` / `default_tools_approval_mode` (consumer config for plugin servers). Gemini `trust: true` is whole-server bypass and is **forbidden in extensions**. | Pkg (Cline, Roo, Kiro), Host elsewhere |
| M10 | Server tool availability filter | Gemini `includeTools`/`excludeTools` (extension servers allowed); Codex `enabled_tools`/`disabled_tools` (config; consumer side for plugin servers); Copilot server `tools` allowlist (required); Roo/Kiro `disabledTools`; Amp skill `includeTools` (skill-bundled servers). | Pkg (Gemini, Roo, Kiro, Amp), Host elsewhere |
| M11 | Process sandbox for a shipped server | VS Code per-server `sandboxEnabled` plus root `sandbox.filesystem.*` / `sandbox.network.*`. Copilot `sandboxMcpServers` and Cursor network modes are admin-only. | Pkg (VS Code only) |
| M12 | Rationale shown on deny/ask | Codex `justification`; Gemini `denyMessage`; hook outputs `permissionDecisionReason` (Claude, Codex, Copilot, VS Code). | Pkg |
| M13 | Exception carved out of a broad rule | Kiro rule `exclude[]`; OpenCode by ordering (a later narrower rule wins); Devin same-level specificity (a more specific command/MCP allow beats a broader ask); Gemini by priority. | Pkg |
| M14 | Code-extension host-API grants | Lume extension grants (`workspace`, `fetch`, `executor`, `decisions`, ...; missing required grant blocks load); Cline plugin capability declarations (registration APIs). | Pkg, code modules only |

### 1.2 Host-only permission configuration (packages cannot set it natively)

| Meaning | Spellings |
|---|---|
| Session/user/project rule sets | Claude `permissions.allow/ask/deny` in settings; Devin config `permissions`; Kiro `permissions.yaml` (workspace copy stored outside the repo); OpenCode config `permission`; Codex `rules/*.rules` (user and trusted project layers); Cursor `.cursor/permissions.json` (grants only; a present file allowlist replaces the IDE allowlist); Copilot `permissions-config.json` (app state); Amp `amp.mcpPermissions` (first match wins), `amp.tools.disable`; Cline `toolAutoApprove`, `disabledTools`; Gemini user/admin policies, MCP `trust`; Cascade allowlist/denylist (denylist means ask). |
| Session approval posture | Claude `permissions.defaultMode` (`default`, `manual`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`), `disableBypassPermissionsMode`, `disableAutoMode`; Codex `approval_policy`, sandbox modes and permission profiles (`:read-only`, `:workspace`, `:danger-full-access`, `[permissions.<name>]`); Gemini approval modes (`default`, `autoEdit`, `plan`, `yolo`); Devin modes (Normal, Accept Edits, Smart, Bypass, Autonomous); Goose `GOOSE_MODE` (`auto`, `approve`, `chat`, `smart_approve`); Cascade auto-execution levels; Pi `defaultTools`, `--tools`. |
| Directory grants | Claude `additionalDirectories`; Copilot `allowed_directories`; OpenCode `external_directory`. |
| Host sandbox | Claude sandbox settings; Codex sandbox; Copilot sandbox floor; Gemini `docker`/`podman`/`sandbox-exec`/`runsc`/`lxc`/`windows-native`; Devin sandbox; Kiro Web sandbox. |

### 1.3 Gates (consumer- or admin-owned)

| Gate | Tools and spellings |
|---|---|
| Workspace trust gates project-scoped content | Claude (settings hooks, project allow rules and directories, project plugins); Codex (`trust_level`; project `.codex/` config, hooks, rules); Copilot (folder trust before workspace MCP; added directories); VS Code Workspace Trust (workspace hooks, workspace MCP); Gemini `security.folderTrust`, `~/.gemini/trustedFolders.json`; Kiro (repo agents, steering, MCP, skills); Pi (`~/.pi/agent/trust.json`, `defaultProjectTrust`; context files still load); Lume (exact realpath directory); Cascade Restricted Mode. Cursor, OpenCode, Amp, Goose, Cline, Roo: none documented. |
| Install/enable consent | Claude (install/enable warns about executables); Gemini (prompt, `--consent` skips); VS Code (marketplace trust prompt on first install); Devin CLI (preview, `-y` skips); Lume (`/extensions` confirmation); Roo (opens config for review); Cursor Enterprise local imports off by default. Codex, Copilot, Pi, Goose, Amp, Kiro: exact prompt unknown or absent. |
| Per-definition review | Codex hooks: hash-bound review via `/hooks`, changed definitions skipped until reviewed; plugin install does not trust hooks; `--dangerously-bypass-hook-trust`. No other tool hashes definitions. |
| MCP startup approval | Claude project `.mcp.json` (`enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`); VS Code (plugin servers implicitly trusted at install, workspace servers follow Workspace Trust); Copilot (workspace MCP after folder trust; each CLI MCP call needs permission); Gemini (untrusted folder disables MCP). |
| Bypass switches a caller could pass | Claude `-p`/SDK treat settings hooks as trusted; Codex `--dangerously-bypass-hook-trust`; Gemini `--consent`, `--skip-trust`, `GEMINI_CLI_TRUST_WORKSPACE`; Devin `-y`; Pi `--approve`; Lume `--trust-workspace` (headless). |

### 1.4 Managed policy that blocks or requires packages

| Meaning | Spellings |
|---|---|
| Force-enable / force-disable named package | Claude, Copilot, VS Code `enabledPlugins` (plugin-ID map; VS Code `ChatEnabledPlugins`); Cursor required team plugins; Devin managed requires/forbids. |
| Marketplace/source allowlist and blocklist | Claude `strictKnownMarketplaces` (`allowedMarketplaces`), `blockedMarketplaces` (block wins); Copilot `strictKnownMarketplaces` (`[]` blocks all), `extraKnownMarketplaces`; VS Code `ChatStrictMarketplaces`, `ChatExtraMarketplaces`; Codex `requirements.toml` marketplace sources; Gemini `security.allowedExtensions` (regex), `security.blockGitExtensions`. |
| Managed-only customization | Claude `allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`, `strictPluginOnlyCustomization` (bool or `skills`/`agents`/`hooks`/`mcp`), `allowManagedModsOnly`; VS Code `allowManagedHooksOnly`, `strictPluginOnlyCustomization`, `ChatHooks`; Codex `allow_managed_hooks_only`, `features.hooks`. |
| Sideload / local import restriction | Claude `disableSideloadFlags`, `disableCommandPluginSources`; Cursor "Allow Local Plugin Imports"; Devin enterprise disable of CLI plugins. |
| MCP server allow/deny | Copilot and VS Code `allowedMcpServers`/`deniedMcpServers` (`serverName`, `serverUrl`, `serverCommand`; deny wins), VS Code `allowManagedMcpServersOnly`, `chat.mcp.access`; Codex MCP identities (name + URL, command string, or executable with ordered args); Cascade regex allowlist; Goose `GOOSE_ALLOWLIST` (`id`, `command`); Kiro and Amp registry allowlists; Cursor command/URL patterns. |
| Managed rules | Copilot managed `permissions` (deny/ask union, allow and `limitTo` intersection); Kiro `managed-settings.json` (deny/ask only, invalid fails closed); Gemini admin policies; Codex `requirements.toml`. |
| Fail-open policy fetch | Devin: managed manifest fetch failure leaves installs/forbids unapplied for that session. |

### 1.5 Provenance and integrity

| Meaning | Spellings |
|---|---|
| Pin source revision or digest | Claude marketplace git `sha`/`ref`, HTTPS archive SHA-256; ACF lock `commit` + `contentHash`. Agent Plugins, Copilot, Cursor, Codex local install: no documented client-verified pin. |
| Cryptographic signature | MCPB `mcpb sign`/`verify` (X.509, detached PKCS#7 appended to the bundle) is the only package signature format found. Amp hosted repos may require signed commits (repository-host control). No plugin client verifies publisher signatures. |
| Review and publisher identity | Codex public submission (verified publisher, human review); Cursor public marketplace (open source, manual review, no binaries); Devin "official" label. Not client-verifiable. |
| Package containment | Agent Plugins section 4.1 (files inside plugin root, including symlink targets; no subprocess sandbox); Cline loader realpath checks; Cursor skips local symlinks outside `~/.cursor/plugins/local`; Lume refuses manifest/entrypoint symlinks. |

## 2. Proposed canonical ACF core schema

### 2.1 Design rules

1. **One meaning per field.** Grants, rules, availability, and posture are separate fields. The spelling `allowed-tools` never appears in canonical source, because it means a grant on skills (Claude, Copilot, Devin, AS) and a restriction on Devin agents and possibly Kiro skills.
2. **Set semantics, most restrictive wins.** Within one permission set, evaluation order is irrelevant: `deny` > `ask` > `allow`. Host and admin policy always outranks package rules; a package can never claim to override them. Serialization keeps author order so same-format round trips stay byte-stable.
3. **Directional degradation.** A writer may degrade a restriction only toward stricter (hardening `ask` to `deny`, removing a whole tool instead of one call pattern, hoisting a skill-scoped rule to package scope) and a grant only toward narrower (dropping it). Each degradation emits a `lossy` diagnostic. A writer must never broaden a grant or weaken a restriction.
4. **Enforcement is declared, not assumed.** When no stricter native form exists, a restriction with `enforcement: required` blocks emission of the facet that carries it (`error` diagnostic `acf.adapter.enforcement-unavailable`). With `best_effort`, it is dropped with `lossy`. This replaces the fail-open "degrade to observe" rule of SPEC 13.7/22.6 for permission-bearing content.
5. **Portable vocabulary only.** Rules reference ACF operation ids (SPEC 14.5, 24), never target-native tool names. Native-only rule forms stay in per-target extras (section 5).
6. **Grants are consented.** Grants that a host scopes to the facet's own activity (skill, command, agent) ship as package content. Grants that land in shared host configuration need consumer acceptance recorded in the lock (section 2.5).

### 2.2 Rule grammar

`PermissionRule` is a string: `<operation>` or `<operation>(<specifier>)`. An operation without a specifier matches every call of that operation.

| Operation | Specifier grammar | Meaning | Origin tools |
|---|---|---|---|
| `shell` | Command pattern: whitespace-separated tokens; `*` matches any character sequence including spaces; a trailing ` *` means "this argv prefix, then anything". Compound commands are evaluated per simple command. | Shell command execution | Claude `Bash(...)`/`PowerShell(...)`, Copilot `Bash/Shell/PowerShell(...)`, Codex `prefix_rule(pattern)`, Gemini `commandPrefix`, OpenCode `bash` patterns, Kiro `shell` `match`, Devin `Exec(...)`, Cursor `terminalAllowlist`, Cascade allowlist |
| `file_read` | Path glob (`*`, `**`, `?`, `{a,b}`); relative paths resolve from the consuming workspace root; `~/` is the home directory; absolute paths allowed. | Read file content (including search tools that read) | Claude `Read(...)`, Copilot `Read(...)`, Kiro `fs_read`, Devin `Read(...)`, OpenCode `read` (+ `external_directory` outside the workspace) |
| `file_write` | Path glob as above | Create, overwrite, edit, patch, or delete file content | Claude `Edit(...)` (covers all edit tools), Copilot `Edit(...)` + `Write(...)`, Kiro `fs_write`, Devin `Write(...)`, OpenCode `edit` |
| `web_fetch` | `domain:<host glob>` (`*.example.com` matches subdomains) | HTTP(S) fetch | Claude `WebFetch(domain:...)`, Copilot `Domain(...)`, Kiro `web_fetch`, OpenCode `webfetch` |
| `web_search` | none | Web search | Claude `WebSearch`, Kiro `web_search`, OpenCode `websearch` |
| `mcp` | `<server>/<tool glob>`; server is literal; `<server>/*` is every tool of the server | MCP tool call | Claude `mcp__s__t`, Copilot `server/tool`, Kiro `@server/tool`, OpenCode `<server>_<tool>`, Gemini `mcpName` + `toolName`, Devin and Cascade `mcp__s__t`, Cursor `server:tool` |
| `agent_delegate` | Agent name glob | Start a subagent | Claude `Agent(name)`, OpenCode `task`, Kiro `subagent`, VS Code `agents`, Gemini `subagent`/`invoke_agent` |
| `skill` | Skill name glob | Load or activate a skill | OpenCode `skill`, Kiro `skill`, Claude `Skill(...)` |
| `any` | none | Every operation | Claude `*` (deny/ask), Kiro `all`, OpenCode `"*"` |

Operations from SPEC 24 that are **not valid** in permission rules: `file_edit` (every permission system that distinguishes edit from write still treats them together for safety; Copilot alone can split them, see extras), `code_search`, `doc_search`, `task_management`, `context` (no shared permission meaning).

### 2.3 Field table

| Canonical field | Type | Meaning | Origin tools (shared meaning) |
|---|---|---|---|
| `PermissionSet.allow` | `RuleEntry[]` | Grant: matching calls skip approval within the attachment's scope. | Claude, Copilot, Devin, AS (skill); Claude, Copilot (command); OpenCode, Kiro (agent); Gemini user/admin, Claude/Devin/OpenCode/Kiro host configs (capability) |
| `PermissionSet.ask` | `RuleEntry[]` | Matching calls require human approval; where no human can answer, they are refused. | Devin (skill); OpenCode, Kiro, Gemini (agent); Gemini extension, Claude/Codex/OpenCode/Devin/Kiro host configs (capability) |
| `PermissionSet.deny` | `RuleEntry[]` | Matching calls are refused. | Devin (skill); OpenCode, Kiro, Gemini (agent); Gemini extension, Claude/Codex/OpenCode/Devin/Kiro host configs (capability) |
| `PermissionSet.enforcement` | `"required" \| "best_effort"`, default `required` | Whether `ask`/`deny` may be dropped where a target cannot enforce them or anything stricter. Does not apply to `allow`. | ACF (declared degradation; Kiro managed fail-closed and Cursor `failClosed` are the native analogues) |
| `RuleEntry` | `PermissionRule \| { rule: PermissionRule, except?: string[], reason?: string }` | One rule; the object form adds exceptions and rationale. Writers emit the string form when neither is present. | — |
| `RuleEntry.except` | `string[]` of specifiers for the same operation | Calls matching an exception are not subject to this rule; they fall through to other rules and host defaults. Valid on `ask` and `deny` only. | Kiro `exclude`; OpenCode ordering; Devin same-level specificity; Gemini priority |
| `RuleEntry.reason` | string | Rationale shown to the user/model when the rule asks or denies. | Codex `justification`, Gemini `denyMessage` |
| `ToolFilter.include` | `ToolSelector[]` | Only these tools are available. Absent = inherit. `[]` = none. | Claude, Copilot, VS Code, Gemini, Kiro, Devin agents; Roo groups; Gemini, Codex, Copilot MCP servers |
| `ToolFilter.exclude` | `ToolSelector[]` | These tools are unavailable; applied after `include`. | Claude, VS Code, Kiro agents; Gemini, Codex, Roo, Kiro MCP servers |
| `ToolFilter.enforcement` | `"required" \| "best_effort"`, default `best_effort` | As above; default differs because several tools document availability as a focus control that ignores unknown names (VS Code, Copilot, Lume). | ACF |
| `ToolSelector` | `PermissionRule` with no specifier, except `mcp(<server>/<tool glob>)`, `agent_delegate(<name>)`, `skill(<name>)` | A tool or tool family. Call-pattern specifiers for `shell`/`file_*`/`web_fetch` are invalid here: no tool hides a tool per argument. | — |
| Skill frontmatter `permissions` | `PermissionSet` | Rules while the skill's instructions are active in the current invocation. | M1, M3 |
| Command frontmatter `permissions` | `PermissionSet` | Rules while the command runs. | M2 |
| Agent frontmatter `permissions` | `PermissionSet` | Rules for calls made by this agent. | M4 |
| Agent frontmatter `tools` | `ToolFilter` | Tool availability for this agent. | M5, M6 |
| Agent frontmatter `readOnly` | boolean, default `false` | The agent cannot create, modify, or delete files and cannot run state-changing commands; reads and read-only commands remain. | M7: Cursor `readonly`, Codex `sandbox_mode = "read-only"` |
| `acf.yml` `permissions` | `PermissionSet` | Rules for the whole session while the capability is installed and enabled. `allow` here is a host-level grant (section 2.5). Must not grant tools of servers this capability ships (use `autoApprove`). | M8 natively (Gemini); translated into host configs elsewhere |
| MCP server `autoApprove` | `string[]` of tool-name globs of this server; `"*"` = all | Grant: these tools of this server skip approval. | M9: Cline `autoApprove`, Roo `alwaysAllow`, Kiro `autoApprove`, Codex `approval_mode` |
| MCP server `tools` | `ToolFilter` whose selectors are bare tool-name globs of this server | Tool availability for this server. | M10 |

Count: four attachment points for `PermissionSet`, two for `ToolFilter`, plus `readOnly` and `autoApprove`; three structural types (`PermissionSet`, `RuleEntry`, `ToolFilter`); nine operations; four specifier grammars (command pattern, path glob, domain glob, name glob with `server/tool`).

### 2.4 Validation

- Unknown operation: `error` `acf.permission.unknown-operation` (reuse of `acf.runtime.unknown-operation` is acceptable).
- Specifier on an operation that takes none, malformed glob, or `except` on `allow`: `error` `acf.permission.invalid-rule`.
- The same rule string in two of `allow`/`ask`/`deny` of one set: `warn` `acf.permission.shadowed` (the stricter wins; the other is dead).
- `acf.yml` `permissions.allow` naming `mcp(<own server>/...)`: `error` with a fix-it to `autoApprove`.
- Skill or command `permissions` in a facet whose canonical `invocation.model` is `false` still validate; scope is invocation, not discovery.

### 2.5 Caplet-side canonical state (not package schema)

These live in `capabilities.yml`, `capabilities.lock`, and caplet status; packages never author them.

| Field | Type | Meaning | Native analogues |
|---|---|---|---|
| `capabilities.yml` entry `grants` | `"none" \| "scoped" \| "all"`, default `scoped` | `scoped`: emit grants only where the host scopes them to the facet (skill/command/agent frontmatter, package-shipped MCP fields). `all`: also emit host-level grants (`acf.yml` `allow`, `autoApprove` translated into host config). `none`: drop every grant. | Gemini install consent, Codex hook review, Claude workspace-trust hold on project allow rules |
| Lock entry `grants` | `{ digest: string, rules: string[] }` | The host-level grants accepted for this lock entry. An update whose host-level grants differ from `digest` stops before emission until accepted again (`acf.permission.grant-requires-acceptance`). | Codex hash-bound hook trust |
| Status `activation` | list of `"workspace_trust" \| "install_consent" \| "hook_review" \| "mcp_approval" \| "user_config" \| "managed_policy" \| "reload"` | Gates still pending after emission and native registration. | section 1.3 |
| Diagnostic `acf.policy.blocked` `data.reason` | `"marketplace_not_allowed" \| "marketplace_blocked" \| "package_disabled_by_policy" \| "package_required_by_policy" \| "sideload_disabled" \| "loose_customization_blocked" \| "managed_hooks_only" \| "managed_rules_only" \| "mcp_server_not_allowed" \| "source_not_allowed" \| "local_import_disabled"` | Why a managed policy prevents activation. | section 1.4 |

Hard rules for caplet (breaking them is costly and hard to detect afterward):

- Never write a trust store (`trustedFolders.json`, `trust.json`, Codex `trust_level`, Claude trust acceptance, Lume workspace trust) and never pass a bypass switch from section 1.3 unless the user supplies it explicitly for that invocation.
- Never route around a managed block, for example by falling back from a blocked marketplace plugin to loose files. Report `acf.policy.blocked` instead.

## 3. Field-level support

Cell legend: **N** native (spelling); **T** translated (how); **D** degraded (how; diagnostic); **U** unsupported (consequence). Unless stated, D on a restriction means `acf.lossy.permission.restriction-hardened`; D or U on a grant means `acf.lossy.permission.grant-dropped`; U on a restriction means `acf.adapter.enforcement-unavailable` (`error` when `enforcement: required`, else `lossy` drop). "Vacuous" means the host never prompts, so a grant is already satisfied (info only). "Host" means the translation writes shared host configuration outside the package (owned region, consent rules of 2.5 for grants). "?" means the native effect is UNKNOWN in the inventory.

### 3.1 Current ACF targets and package formats

| Canonical | Claude | Codex | Copilot | VS Code | Cursor | OpenCode | Pi | AP/AS |
|---|---|---|---|---|---|---|---|---|
| skill `allow` | N `allowed-tools` (list) | D emit AS `allowed-tools` string; enforcement ? (info) | N `allowed-tools` (list) | D AS `allowed-tools`; ? (info) | D AS `allowed-tools`; ? (info) | U (no field) | Vacuous (field parsed, not enforced) | N `allowed-tools` space-delimited string (experimental) |
| skill `ask` | D hardened to `disallowed-tools` (whole tool) | D shell only: hoisted to `.codex/rules` `prompt` (Host); others U | U | U | U | D hoisted to config `permission` (Host) | U | U |
| skill `deny` | T `disallowed-tools`; specifier rules D (whole tool removed) | D shell only: hoisted to `.rules` `forbidden` (Host); others U | U | U | U | D hoisted to config `permission` (Host) | U | U |
| command `allow` | N `allowed-tools` (skill-form command) / manifest `allowedTools` | U | N `allowed-tools` | U | U | U | Vacuous | U (no command component) |
| command `ask`/`deny` | as skill | as skill | U | U | U | as skill | U | U |
| agent `allow` | U (plugin and loose agents cannot grant) | U | U | U | U | N agent `permission` (`allow`) | Vacuous | U (no agent component) |
| agent `ask` | D hardened to `disallowedTools` | D shell: global `.rules` `prompt` (Host) | U | U | U | N agent `permission` (`ask`), emitted in order allow, ask, deny | U | U |
| agent `deny` | T `disallowedTools`; specifier rules D | D shell: global `.rules` `forbidden` (Host) | U | U | U | N agent `permission` (`deny`) | U | U |
| agent `tools.include` | N `tools` | U (no tools field) | N `tools` (aliases) | N `tools` | U | D `permission: {"*": deny}` then listed keys; inherited asks lost | U | U |
| agent `tools.exclude` | N `disallowedTools` | U | U (no exclude; complement not computable) | N only in `.claude/agents` format `disallowedTools` | U | T `permission.<key>: deny` | U | U |
| agent `readOnly` | D `disallowedTools: Edit, Write, NotebookEdit, Bash` (all shell removed) | N `sandbox_mode = "read-only"` (parent live overrides reapplied; info) | D `tools` without `edit`/`execute` | D `tools` without edit/terminal tools | N `readonly: true` | D `permission: {edit: deny, bash: deny}` | U | U |
| capability `allow` | T settings `permissions.allow` (Host; project copy applies after trust); not inside a plugin | U (`prefix_rule allow` also escapes the sandbox; see C5) | U | U | T shell `terminalAllowlist`, mcp `mcpAllowlist` in `.cursor/permissions.json` (Host; replaces IDE allowlist) | T config `permission` (Host) | Vacuous | U |
| capability `ask` | T settings `permissions.ask` (Host); not inside a plugin | T shell `.rules` `prompt`; mcp `tools.<t>.approval_mode = "prompt"` (Host); others U | U (managed only) | U | U (`block_instructions` not enforced) | T config `permission` (Host) | U | U |
| capability `deny` | T settings `permissions.deny` (Host) | T shell `.rules` `forbidden`; mcp `disabled_tools` (stricter, D); others U | U | U | U | T config `permission` (Host) | U | U |
| `except` | D dropped (rule applies to exceptions too) | D dropped | D dropped | — | — | T ordering when exception ⊂ rule pattern; else D dropped | — | — |
| `reason` | D dropped (info) | N `justification` | D dropped | — | — | D dropped | — | — |
| MCP `autoApprove` | T settings `permissions.allow: mcp__<s>__<t>` (Host) | T `tools.<t>.approval_mode` (Host; exact enum value ?) | U (approvals are app state) | U (plugin servers already implicitly trusted) | T `mcpAllowlist: "<s>:<t>"` (Host) | T `permission["<s>_<t>"]: allow` (Host) | Vacuous | U |
| MCP `tools.include` | U (no per-server filter) | T `enabled_tools` (Host for plugin servers) | N server `tools` | ? | U | D deny-all-then-allow in `permission` | U | U |
| MCP `tools.exclude` | D settings `permissions.deny: mcp__<s>__<t>` (refused, not hidden; Host) | T `disabled_tools` (Host for plugin servers) | U | ? | U | T `permission["<s>_<t>"]: deny` | U | U |
| op `shell` | `Bash(<pattern>)` and `PowerShell(<pattern>)` | `prefix_rule(pattern=[...])` (argv tokens; non-prefix `*` U) | `shell(<pattern>)` in `allowed-tools` (specifier support ?); managed `Shell(...)` | ? | `terminalAllowlist` prefix entries | `bash` pattern | — | Claude-style string (spaces break the delimiter, see C9) |
| op `file_read` | `Read(<glob>)` | U | `Read(<glob>)` (managed) | ? | U | `read` (+ `external_directory`) | — | as Claude |
| op `file_write` | `Edit(<glob>)` | U (sandbox only) | `Edit(<glob>)` + `Write(<glob>)` | ? | U | `edit` | — | as Claude |
| op `web_fetch` | `WebFetch(domain:<h>)` | U | `Domain(<h>)` | ? | U | `webfetch` | — | as Claude |
| op `web_search` | `WebSearch` | U | alias `web` (availability only) | ? | U | `websearch` | — | as Claude |
| op `mcp` | `mcp__<s>__<t>` (allow needs literal server) | per-server config | `<s>/<t>` | `<s>/*` (availability) | `<s>:<t>` | `<s>_<t>` | — | ? |
| op `agent_delegate` | `Agent(<name>)` | U | alias `agent` (availability) | `agents` list (availability) | U | `task` pattern | — | U |
| op `skill` | `Skill(...)` (exact form ? see Q4) | U | U | U | U | `skill` pattern | — | U |
| gate workspace trust | N (interactive dialog) | N `trust_level` | N folder trust (MCP) | N Workspace Trust | ? | none | N project trust | — |
| gate install consent | N warning on install/enable | ? | ? | N first-install marketplace prompt | ? (Enterprise local import permission) | none | install warning only | — |
| gate hook review | via workspace trust | N hash-bound `/hooks` review | none | via Workspace Trust | none | none | none | — |
| gate MCP approval | N project `.mcp.json` approval | via project trust | N folder trust + per-call permission | N (workspace servers via trust; plugin servers implicit) | ? | none | none | — |
| managed policy detection | managed settings keys (1.4) | `requirements.toml` | managed settings JSON/MDM | enterprise policies | team/enterprise settings | managed `opencode.json` | none | none |
| provenance pin | marketplace `sha`/`ref`, archive SHA-256 | ? | ? | ? | ? | npm (`ignoreScripts`) | ? | none |

### 3.2 Other inventoried tools

| Canonical | Gemini | Amp | Cascade | Devin | Cline | Roo | Goose | Kiro | Lume |
|---|---|---|---|---|---|---|---|---|---|
| skill `allow` | U (loader reads name/description only) | Vacuous (no approval by default) | ? | N `permissions.allow` (or `allowed-tools`); inline only (info) | ? (parsed) | U (parser ignores) | U (not implemented; dropping only adds prompts) | U (meaning conflicts, C2) | Vacuous (ignored) |
| skill `ask` | D hoisted to extension policy `ask_user` | U | U | N `permissions.ask`; not applied in subagent execution (D: warn when skill forks) | U | U | U | U | U |
| skill `deny` | D hoisted to extension policy `deny` | U | U | N `permissions.deny` (same subagent caveat) | U | U | U | U | U |
| command `allow` | U | Vacuous | U | N (commands become skills) | U | U | U | U | Vacuous |
| agent `allow` | U (extension allow filtered) | Vacuous | — | U | U | U | U | N `permissions.rules` `effect: allow` / `allowedTools`; delegation via `trustedAgents` | Vacuous |
| agent `ask` | N policy `subagent=<a>`, `decision="ask_user"` | U | — | U | U | U | U | N `effect: ask` | U |
| agent `deny` | N policy `subagent=<a>`, `decision="deny"` | U | — | D via agent `allowed-tools` (whole tool) | U | D via mode `groups` (whole group) | U | N `effect: deny` | U |
| agent `tools.include` | N `tools` | U | — | N agent `allowed-tools`/`tools` | U | D mode `groups` (coarse) | U | N `tools` | U (role selectors are focus controls) |
| agent `tools.exclude` | D policy deny with `subagent` (refused, not hidden) | U | — | U | U | D drop groups | U | N `excludedTools` | U |
| agent `readOnly` | D `tools` limited to read tools | U | — | D read-only `allowed-tools` | U | D groups without `edit`, `command` | U | D rules deny `fs_write`, `shell` | U |
| capability `allow` | U in extension (filtered); Host user policy only with `grants: all` | Vacuous | U (UI/team setting) | T project config `permissions.allow` (Host) | U | U | U | T workspace `permissions.yaml` outside repo (Host) | Vacuous |
| capability `ask` | N extension policy `ask_user` | U (policy plugins are code) | U | T project config `permissions.ask` (Host) | U | U | U | T workspace `permissions.yaml` (Host) | U |
| capability `deny` | N extension policy `deny`; availability form `excludeTools` | D `amp.tools.disable` (whole tool; Host) | U | T project config `permissions.deny` (Host) | D `disabledTools` (Host) | U | U | T workspace `permissions.yaml` (Host) | U |
| `except` | D dropped (priority cannot express fall-through) | — | — | T when the exception is paired with a more specific `allow` at the same level (command/MCP only); else D dropped | — | — | — | N `exclude` | — |
| `reason` | N `denyMessage` (deny only) | — | — | ? | — | — | — | U | — |
| MCP `autoApprove` | U in extension (`trust` forbidden); Host `trust: true` only for `"*"` | Vacuous | U | T `permissions.allow: mcp__<s>__<t>` (Host) | N `autoApprove` (Host MCP settings) | N `alwaysAllow` | U | N `autoApprove` (agent-local or legacy powers; not in Agent Plugins `mcp.json`) | Vacuous |
| MCP `tools.include` | N `includeTools` | N skill `includeTools` (skill-bundled servers only) | U | U | U | U | U | U | U (role `mcp` selects servers only) |
| MCP `tools.exclude` | N `excludeTools` | U | U | U | U | N `disabledTools` | U | N `disabledTools` | U |
| op `shell` | `run_shell_command` + `commandPrefix` | — | allowlist prefix `*` | `Exec(<cmd>)` | — | group `command` | — | `shell` `match` (`*` only) | — |
| op `file_read` | `read_file`/`read_many_files` + `argsPattern` (names ?) | — | — | `Read(<glob>)` | — | group `read` | — | `fs_read` | — |
| op `file_write` | `write_file`/`replace` (names ?) | — | — | `Write(<glob>)` | — | group `edit` (+ `fileRegex` from glob) | — | `fs_write` | — |
| op `web_fetch` | `web_fetch` | — | — | HTTP fetch rule (syntax ?) | — | — | — | `web_fetch` | — |
| op `mcp` | `mcpName` + `toolName` | — | — | `mcp__<s>__<t>` | — | group `mcp` | — | `mcp` match `@<s>/<t>` (?) | — |
| op `agent_delegate` | `subagent` / `invoke_agent` | — | — | U | — | group `modes` (coarse) | — | `subagent` | — |
| op `skill` | ? (activation consent) | — | — | U | — | — | — | `skill` | — |
| gate workspace trust | N `folderTrust` | none | N Restricted Mode | ? | none | none | none | N | N |
| gate install consent | N prompt (`--consent`) | ? | none | N CLI preview (`-y`), web notice | ? | N config review | none | ? (warning) | N `/extensions` confirmation |
| managed policy detection | system settings `allowedExtensions`, `blockGitExtensions`, admin policies | enterprise MCP registry | admin execution cap, MCP allowlist | managed requires/forbids (fails open on fetch failure) | ? | ? | `GOOSE_ALLOWLIST` | `managed-settings.json`, MCP registry | none |
| provenance pin | none | signed commits (hosted repos) | none | none | none | none | none | ? | none |

## 4. Conflicts that must not be unioned

| # | Conflict | Evidence | Handling |
|---|---|---|---|
| C1 | **Grant vs availability.** Claude skill `allowed-tools` grants and does not filter; Claude agent `tools` filters and does not grant; Copilot, VS Code, Gemini, and Kiro agent `tools` filter. | Claude, VS Code, Copilot, Kiro inventories | Separate canonical fields: `permissions.allow` vs `tools.include`. Readers map by (format, attachment). |
| C2 | **Same spelling, opposite meaning.** `allowed-tools` grants on skills (Claude, Copilot, Devin, AS) but restricts on Devin agents; Kiro Power Builder calls skill `allowed-tools` a restriction. Kiro agent `tools: ["*"]` grants all, `allowedTools: ["*"]` does not. | Windsurf, Kiro inventories | The spelling is banned in canonical source. Kiro skill `allowed-tools` is read into extras only, never projected, until its meaning is verified. |
| C3 | **Precedence models.** Most restrictive wins (Claude, Copilot, VS Code hooks, Codex rules, Kiro across scopes); last match wins (OpenCode); first match wins (Amp `mcpPermissions`); numeric tier plus priority (Gemini); later hook output overrides earlier (Copilot `permissionRequest`); same-level specific allow beats broader ask (Devin). | inventories | Canonical choice: set semantics, `deny` > `ask` > `allow`, with `except` for carve-outs. OpenCode writer orders keys allow, ask, deny. OpenCode reader projects a map only when every later, less restrictive key's pattern is a subset of the earlier key's pattern (glob subset is decidable), turning it into `except` + rule; otherwise the whole map stays raw (`acf.reader.permission-order-dependent`, lossy for other targets). Devin writer drops a canonical `allow` that is more specific than a same-level `ask` without a matching `except` (Devin would allow what the canonical model asks). Gemini priorities stay raw. |
| C4 | **Scope of a grant.** Claude skill grants are turn-scoped; Copilot "while active"; Devin inline only and ignored in subagent execution; Kiro and OpenCode agent-scoped. | inventories | Canonical scope is the attachment's activity; host lifetime differences are info diagnostics. Devin forked skills: `warn` because skill rules are ignored there. |
| C5 | **What `allow` permits.** Canonical allow = no prompt, same confinement. Codex `prefix_rule(decision="allow")` runs the command **outside the sandbox**. Cursor allowlists are "not a security boundary". Gemini `trust` bypasses all confirmations for a server. | Codex, Cursor, Gemini inventories | Codex writer never emits `allow` rules (grant dropped, `lossy`). Gemini `trust` only for `autoApprove: ["*"]` with `grants: all`. |
| C6 | **Package grant power differs by host.** Gemini drops extension allow rules (verified in source); Claude plugin settings drop permissions; Kiro and Copilot let packages only narrow below admin policy. | section 0 verification, inventories | Grants are never assumed effective; status reports dropped grants. `acf.yml` `allow` is a host-level grant gated by `grants: all`. |
| C7 | **Headless `ask`.** Gemini: deny. Copilot cloud: deny. Devin background workers: auto-deny not pre-approved. Codex: falls back to parent. Claude `-p`: ? | inventories | Canonical: refuse when no human can answer. Targets that might auto-allow are unknown; flagged in Q5. |
| C8 | **Hook permission-decision contracts.** Claude `PermissionRequest`: exit 2 alone does not deny (JSON `decision.behavior` required); `PreToolUse` has `defer`. Copilot: exit 2 denies, timeouts always fail open, `permissionRequest` later output wins. Codex: `PreToolUse` has no `ask`; `PermissionRequest` reserved fields fail closed; any deny wins. Cursor: `ask` accepted but unenforced on `preToolUse`; `failClosed` opt-in. ACF default protocol: exit 2 = deny, other failures and timeouts = observe. | hooks sections | Owned by the hooks facet; permission-facet requirements: (a) `decide` with `ask` degrades to `deny` where `ask` is unenforced (Codex, Cursor `preToolUse`); (b) a writer whose host would fail open on timeout must declare it (`lossy`); (c) the Claude writer must wrap exit 2 into JSON `decision.behavior: "deny"`; (d) remove fail-open "decide → observe" for permission-bearing hooks (rule 4). |
| C9 | **List encoding.** AS/AP `allowed-tools` is a space-delimited string; Claude accepts string or list; Copilot comma string or list. Specifiers contain spaces (`Bash(git log *)`). | Agent Skills, Claude, Copilot inventories | Canonical stores lists. AS/AP writer emits the string only when no rule contains whitespace; otherwise emits Claude's legacy `:*` prefix form when equivalent, else drops the grant (`lossy`). Exact AS tokenizer behavior with parentheses is Q2. |
| C10 | **Edit vs write.** Claude `Edit` covers writes; OpenCode `edit` covers write/patch; Kiro `fs_write`; Copilot distinguishes `Edit` and `Write`. | inventories | Canonical has only `file_write`. Copilot's finer split stays in Copilot extras. |
| C11 | **Approval modes do not align.** Claude `permissionMode` (7 values; ignored by plugin agents), Codex approval/sandbox profiles, Gemini approval modes, Devin modes, Goose modes. `acceptEdits`, `dontAsk`, `auto`, `bypassPermissions` have no shared equivalents; `bypassPermissions` escalates. | inventories | Not canonical, except the shared `readOnly` subset. Per-target extras, and caplet never emits an escalating mode (`bypassPermissions`, `auto`, `dontAsk`, Codex `danger-full-access`) unless the consumer sets `grants: all`. |
| C12 | **`untrusted` means two things in Codex.** Retired `approval_policy="untrusted"` vs project `trust_level="untrusted"`. | Codex inventory | Neither is canonical; trust state is never written by caplet. |
| C13 | **Restriction vs refusal for denies.** Claude `disallowedTools` hides a whole tool; a `deny` rule refuses calls. Gemini `excludeTools` hides; policy `deny` refuses. | inventories | Distinct canonical fields (`tools.exclude` vs `permissions.deny`). Hiding where only refusal exists (and vice versa) is a declared degradation. |
| C14 | **Package-wide restrictions outlive the package in some hosts.** Translating `acf.yml` deny/ask into Claude or Devin settings keeps them active if the user disables the plugin natively. | Claude plugin enable model | Caplet owns those settings regions, reports them in status, and removes them on `caplet remove`; status flags "plugin disabled, restrictions still applied". |

## 5. Per-target extras and lossless round trips

### 5.1 Mechanism

- **Foreign packages** keep the immutable native snapshot (advisor section 2). Readers project only rules that parse into the canonical grammar; every other permission-bearing field stays in the native remainder attached to its facet. Unchanged same-format output copies the snapshot bytes; no reserialization.
- **Native ACF sources** carry tool-only data under `targets.<target>` (SPEC 7). This facet adds permission keys to each target's extension schema (section 6). Extras are emitted verbatim to that target only and dropped with `acf.adapter.extension-ignored` elsewhere.
- **Ownership rule:** a native output key is owned either by the canonical projection or by extras, never both. A rule string present in both is an `error` (`acf.permission.duplicate-owner`).
- **Order:** canonical rule lists keep author order for serialization even though evaluation ignores it. OpenCode extras keep map order because it is semantic there.
- **Unparsed native rules** (Claude `Tool(param:value)`, `Agent(model:opus)`, legacy `Bash(git:*)` that is not a pure prefix, Codex `match`/`not_match` tests) round-trip as opaque strings in `targets.<t>.permissions.raw` with their original list (allow/ask/deny or field name). They are re-emitted at the same position after canonical entries.
- **Excluded or renamed facets:** raw permission extras attached to a facet are dropped with the facet; a rename rewrites only canonical selectors (`agent_delegate(<name>)`, `skill(<name>)`, `mcp(<server>/...)`) and leaves raw strings untouched with a `warn` when they mention the old name.

### 5.2 What stays raw per tool

| Tool | Raw extras (attachment) |
|---|---|
| Claude | Agent `permissionMode` (loose agents only; plugin agents ignore it, `lossy` when emitted into a plugin); rule strings outside the canonical grammar; skill `disallowed-tools` entries not produced by canonical translation; manifest command-map `allowedTools` spelling preference; hook `updatedPermissions` entries (hooks facet). Settings-only keys (`defaultMode`, `additionalDirectories`, `disableBypassPermissionsMode`, `blockReadsOutsideWorkingDirectories`) are **not** accepted as extras: packages do not own consumer settings (advisor section 1, settings row). |
| Codex | Agent TOML `approval_policy` and non-read-only `sandbox_mode` / permission profiles (escalation gate C11); `.rules` `match`/`not_match`; non-prefix rule forms; MCP `default_tools_approval_mode` values other than the one used for `autoApprove`. |
| Copilot | Distinct `Edit` vs `Write` rules (C10); agent tool aliases not expressible as canonical selectors (`todo`); `modelPolicy` is not permission data. Managed `permissions`, `limitTo`, sandbox floor: not package data, not accepted. |
| VS Code | MCP `sandboxEnabled` and root `sandbox.filesystem.*`/`sandbox.network.*` (M11, VS Code only); agent `handoffs` (not permission data). |
| Cursor | Agent `readonly` when authored natively and also canonical `readOnly`: canonical wins, raw duplicate is an error; `autoRun.allow_instructions`/`block_instructions` are host-only and not accepted. |
| OpenCode | Order-dependent `permission` maps (C3); input-pattern maps; keys without canonical operations (`todowrite`, `question`, `doom_loop`, `lsp`, `list`, `glob`, `grep`); legacy `tools` map. |
| Gemini | Policy `priority`, `modes`, `interactive`, `toolAnnotations`, `allowRedirection`, `argsPattern`, `commandRegex`, `[[safety_checker]]`; manifest `excludeTools` forms such as `run_shell_command(rm -rf)` when not a canonical selector. |
| Devin | Skill `allowed-tools` when it differs from `permissions.allow`; agent `max-nesting` (not permission data). |
| Kiro | `toolAliases`; rule `capability` values without canonical operations (`power`, `context`, `diagnostics`, `sandbox_network`, meta `builtin`, `filesystem`); `includePowers`; skill `allowed-tools` (C2). |
| Roo | Mode `groups` tuples with `fileRegex` that do not round-trip to a glob; `browser` legacy group (stripped by Roo itself). |
| Cline, Lume | Code-extension capability declarations and grants (M14): belong to a future code-module facet, not this one. |
| Amp | `amp.tools.disable` `builtin:` forms, `mcpPermissions` (host-only, not accepted); plugin `tool.call` policy is code. |
| AP/AS | Nothing beyond `allowed-tools`; ACF permission data travels in the ACF extension namespace directory and is ignored by other Agent Plugins clients. |

## 6. Delta against current ACF SPEC and code

Sources read: `SPEC.md` (sections 1.4, 7, 9.2, 10.5, 13.6.6, 13.7, 14.3–14.5, 15, 22.3, 22.6, 24, 25), `packages/core/src/types/model.ts`, `packages/core/src/targets/registry.ts`, `packages/core/src/targets/extensions.ts`, `packages/core/src/reader/index.ts`, `packages/adapters/src/common/{emitter,skills,text}.ts`, `packages/adapters/src/claude/index.ts`, `IMPLEMENTATION.md`, `CONTEXT.md`.

### 6.1 What exists

- Hook type `permission_request` with effects `observe`/`decide` (`hookEffectMatrix`); `decide` payload owned by adapters (SPEC 13.7).
- Provisional operation set (SPEC 24) and the rule that portable runtime fields must not use native tool names (SPEC 14.5).
- `targets.<target>` extension slots; `extensions.ts` gives every target the same `agentExtension` with `tools: string[]` and an unvalidated `permissions: Record<string, unknown>`.
- Lock entries with `commit` and `contentHash` (paths and bytes, not file modes).
- Reader accepts skill `allowed-tools` as a pass-through ecosystem key (`reader/index.ts`, `frontmatterKeys.skill`).

### 6.2 Defects found that this facet depends on

1. **Native agent/command/skill files receive the canonical frontmatter verbatim.** `emitProseFiles` and `emitSkills` call `renderMarkdownFile(facet.frontmatter, ...)`, so `targets`, `only`, `except`, `assets`, and `invocation` are written into `.claude/agents/*.md` and peers. A permission declared the documented way (SPEC 10.5 example `targets.claude.tools`) therefore lands as a nested `targets:` key that Claude does not read: the restriction silently does not apply (fail-open). Needs a regression test that asserts native `tools:` in emitted Claude agents.
2. **Skill `allowed-tools` is copied unvalidated to every target**, in Claude's grammar, including Codex, OpenCode, Pi, and Cursor skill directories where its meaning is unknown or ignored. This contradicts SPEC 14.5 and C2.
3. **Registry maps Claude `permission_request` to `PreToolUse`** (`registry.ts`, `IMPLEMENTATION.md` comment "approximated via PreToolUse + decision", SPEC 22.3). Claude has a native `PermissionRequest` event; `PreToolUse` fires for every call, including ones that never needed approval.
4. **Registry declares Cursor hooks `none`** although Cursor ships `beforeShellExecution`, `beforeMCPExecution`, `preToolUse` decision hooks; this hides the only way to enforce restrictions on Cursor.
5. **SPEC 13.7 and 22.6 degrade `block` and `decide` to `observe`** (fail-open) and SPEC 13.6.6 treats timeouts as non-blocking.

### 6.3 What changes

| Location | Change |
|---|---|
| SPEC 1.4 | Replace "ACF does not define a permission policy language" with: ACF defines a minimal portable rule vocabulary (section 2.2) and no sandboxing model, secret format, or host policy. |
| SPEC 10.5, 15, 25; CONTEXT.md open question | Lift the reservation on agent `tools`/`permissions`; add `permissions`, `tools`, `readOnly` (additive within `acf: 1` per SPEC 15, since the fields were reserved, not defined). |
| SPEC 9.2, 11.2 | Add skill and command `permissions`; deprecate `allowed-tools` in canonical source (`warn` with fix-it) while readers of foreign formats still parse it. |
| SPEC 4.2 | Add capability-level `permissions`. |
| SPEC 13a.3 | Add MCP server `autoApprove` and `tools` (coordinate with the MCP facet). |
| SPEC 24 | Add operation `skill`; state which operations are valid in permission rules; add the four specifier grammars. |
| SPEC 13.7, 22.6 | Permission-bearing effects (`block`, `decide`) no longer degrade to `observe` by default; directional degradation and `enforcement` apply (rule 3, 4). |
| SPEC 14.6 | New codes: `acf.permission.invalid-rule`, `acf.permission.unknown-operation`, `acf.permission.shadowed`, `acf.permission.duplicate-owner`, `acf.permission.grant-requires-acceptance`, `acf.lossy.permission.restriction-hardened`, `acf.lossy.permission.grant-dropped`, `acf.adapter.enforcement-unavailable`, `acf.reader.permission-order-dependent`, `acf.policy.blocked`. |
| SPEC 17.5, 19.3 | `capabilities.yml` entry `grants`; lock entry `grants` digest; hash covers executable modes (advisor). |
| SPEC 22 / registry | Replace family-level `full/partial/none` for this facet with per-target declarations keyed by (attachment, `allow`/`ask`/`deny`/`tools`/`readOnly`, operation) giving native spelling, translation, degradation, or unsupported, so section 3 is generated from the registry instead of maintained by hand. Fix defects 3 and 4. |
| `model.ts` | Types `PermissionRule`, `RuleEntry`, `PermissionSet`, `ToolFilter`; fields on `SkillFacet`, `CommandFacet`, `AgentFacet` frontmatter, `Manifest`, `McpServerBase`; `LockEntry.grants`; `CapabilityEntry.grants`. |
| `schemas/index.ts`, `reader/index.ts` | Zod schemas with the validation of 2.4; reader keeps `allowed-tools` only as a deprecated alias for canonical sources. |
| `targets/extensions.ts` | Per-target schemas instead of one shared schema; permission extras of section 5.2; remove the generic `permissions: unknownRecord`. |
| `packages/adapters` | One shared rule translator (`common/permissions.ts`) driven by registry vocab tables; writers strip canonical-only keys from native frontmatter (defect 1); Host translations as owned regions in existing settings files; Claude plugin writer puts skill/command/agent rules inside the plugin and package-level rules in owned settings regions (C14). |
| `apps/caplet` | Grant acceptance flow; managed-policy preflight producing `acf.policy.blocked`; status `activation` gates; never pass bypass switches. |

### 6.4 What is new

The rule grammar; the four attachment points; directional degradation and `enforcement`; grant acceptance with a lock digest; activation-gate and policy-block vocabularies; managed-policy preflight. Nothing in the current code reads managed settings or trust state.

## 7. Open questions and unverified claims

| # | Question / claim | Why it matters | How to resolve |
|---|---|---|---|
| Q1 | Product decision: default `grants: scoped`, and whether host-level grants need re-acceptance on every digest change. | Determines whether `caplet add` can ever widen authority silently. | User decision; proposal above. |
| Q2 | How Agent Skills tokenizers and Claude/Copilot parse `allowed-tools` strings containing parentheses with spaces. | C9 encoding. | Test `Bash(git log *)` in Claude, Copilot, Pi parser. |
| Q3 | Whether Copilot `allowed-tools` accepts specifiers (`shell(git:*)`), and Codex/VS Code/Cursor enforcement of `allowed-tools`. | Cells marked ? in 3.1. | Runtime tests per client. |
| Q4 | Exact Claude `Skill` rule form (`Skill(name)` vs `Skill(skill:name)`); docs mention a `Skill(skill:)` deny rule. | op `skill` mapping. | Read the full Claude permissions page section. |
| Q5 | Claude `-p`/SDK behavior for `ask` rules with no human. | C7 canonical promise. | Runtime test. |
| Q6 | Gemini extension-policy allow filter was read on `main`, not a pinned release; tier numbering differs between docs (admin 4) and inventory source reading (user 4, admin 5). | C6; Gemini cells. | Pin to the release in use and re-read `policy/config.ts`. |
| Q7 | Codex MCP `approval_mode` enum meanings (`auto`, `prompt`, `writes`, `approve`). | `autoApprove` and `ask` translation. | Codex config reference. |
| Q8 | Whether Claude plugin MCP servers need the project MCP approval, and the non-interactive behavior of `claude plugin install` consent. | Activation gates for the Claude plugin backend. | Runtime test with Claude 2.1.97 (installed locally per advisor). |
| Q9 | VS Code shipped support for managed `permissions.allow/ask/deny` (docs contradict) and terminal auto-approve settings keys. | VS Code cells. | Implementation check. |
| Q10 | Devin syntax for HTTP fetch rules and whether agent profiles accept `permissions`. | Devin cells. | Devin docs. |
| Q11 | Kiro skill `allowed-tools` meaning (restriction vs grant); several Kiro pages are post-cutoff. | C2. | Wait for stable docs or runtime test. |
| Q12 | Whether a generated enforcement hook (for example a Claude `PreToolUse` command implementing package-wide deny inside the plugin) should become a translation path for hosts without package rules. | Would convert many U cells to T but adds a hook runtime, which the advisor defers. | Decide after the hooks facet settles its runtime stance. |
| Q13 | Ownership: agent `tools`/`readOnly` overlap with the agents facet; MCP `autoApprove`/`tools` with the MCP facet; hook decision contracts with the hooks facet; `sensitive` user config with the configuration facet. | Avoid two facets defining one field. | Cross-facet review; this document proposes the fields, other facets reference them. |
| Q14 | Whether caplet should honor a consumer-side policy file (allowed sources, required signatures) analogous to managed settings. | No tool verifies plugin signatures; only MCPB signs bundles. | Defer until a concrete need; ACF lock pins already cover integrity. |
