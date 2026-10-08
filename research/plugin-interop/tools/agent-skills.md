# Agent Skills open standard + AGENTS.md + MCP Bundles - capability inventory (snapshot 2026-10-01)

## Skills

**Scope:** Agent Skills, AGENTS.md, and MCP Bundles are formats, not individual agent products. “Not supported” below means **not defined by these formats**, not that their consuming tools lack the feature.

**Evidence/version:** Agent Skills specification is unversioned; official source inspected on 2026-10-01. MCPB `MANIFEST.md` identifies **0.3, last updated 2025-12-02**, while the repository contains implemented **0.4** schemas and package version **2.1.2**. Host release availability for every schema feature is **UNKNOWN**. [Skills source](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [MCPB manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [schema registry](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/index.ts), [package](https://github.com/modelcontextprotocol/mcpb/blob/main/package.json).

Agent Skills requires `<skill-name>/SKILL.md`: YAML frontmatter followed by unrestricted Markdown. Every field below is defined by the [specification](https://agentskills.io/specification), corroborated by its [official source](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx).

| Field | Type | Required | Meaning and constraints |
|---|---|---|---|
| `name` | string | Yes | 1–64 characters; lowercase alphanumeric and hyphens; no leading/trailing or consecutive hyphens; must match containing directory name. |
| `description` | string | Yes | 1–1024 characters; explains capability and activation conditions. |
| `license` | string | No | License name or reference to bundled license file. |
| `compatibility` | string | No | 1–500 characters when supplied; environment/product/system-package/network requirements. Not an executable dependency declaration. |
| `metadata` | map<string,string> | No | Arbitrary additional metadata; reasonably unique keys recommended. `author` and `version` are examples, not separately standardized fields. |
| `allowed-tools` | string | No | **Experimental** space-separated pre-approved tool identifiers/patterns; illustrative spelling `Bash(git:*) Bash(jq:*) Read`. Support varies by implementation. |

[Source for all rows](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx).

| Path | Contract |
|---|---|
| `SKILL.md` | Required metadata and instructions. |
| `scripts/` | Optional executable code; language/runtime support belongs to the consuming agent. |
| `references/` | Optional documentation loaded as needed. |
| `assets/` | Optional templates, images, schemas, other static resources. |
| Any additional files/directories | Permitted; these three directory names are conventions, not an exhaustive allowlist. |

References use paths relative to the **skill root**; shallow references are recommended. Progressive disclosure loads name/description first, full instructions on activation, auxiliary resources as needed. Keeping `SKILL.md` below 500 lines is guidance, not a field constraint. [Source](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx).

**Discovery and invocation:** the specification describes model selection using metadata, but does not standardize installation directories, discovery precedence, duplicate-name handling, user slash invocation, or per-tool metadata sidecars. Those are **UNKNOWN at the format layer**. Neither AGENTS.md nor MCPB defines a skill-discovery system. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [AGENTS.md](https://agents.md/), [MCPB schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

**Per-tool frontmatter variants:** not inventoried here; they are tool contracts outside this assigned standards subject. No tool-specific field should be represented as standardized merely because it appears in arbitrary `metadata`. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx).

## Instructions and rules

**AGENTS.md:** ordinary Markdown, no required fields, no prescribed frontmatter/schema/headings. Put `AGENTS.md` at repository root; nested files tailor instructions for subprojects. The website states the closest file to the edited file takes precedence, and explicit user chat prompts override file instructions. This is published format guidance, not independently verified behavior of every listed client. [Official guidance and FAQ](https://agents.md/).

| Facet | Standardized behavior |
|---|---|
| Filename | `AGENTS.md` |
| Fields | None required; unrestricted Markdown. |
| Scope | Repository root and nested subdirectories. |
| Conflict precedence | Closest `AGENTS.md` to edited file wins; explicit user prompts override. |
| Activation | Directory/file relationship described; no activation-mode enum. |
| Imports/includes | Not supported as a defined syntax. |
| Globs, model-decided rules, manual rules | Not supported as structured rule fields. |
| `CLAUDE.md`, `GEMINI.md`, `.mdc`, steering files | Not specified by these standards. |

[Source for table](https://agents.md/).

The site illustrates configuring Aider with `.aider.conf.yml` → `read: AGENTS.md`, and Gemini CLI with `.gemini/settings.json` → `context.fileName: "AGENTS.md"`; these examples do not define general precedence for either product. Symlinking a legacy filename is a migration suggestion, not a standardized include mechanism. [Source](https://agents.md/).

Agent Skills Markdown supplies task instructions, not an AGENTS.md-style directory-scoped rule system. MCPB has no instruction-file field; arbitrary bundled Markdown does not acquire instruction semantics automatically. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [MCPB schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

## Subagents and custom agents

**Not supported** as definition types by Agent Skills, AGENTS.md, or MCPB. No standardized agent-definition path or fields such as `model`, `tools`, permissions, `color`, delegation mode, or agent scope. MCPB tool descriptions and prompt templates are not custom agents. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [AGENTS.md](https://agents.md/), [MCPB complete schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

## Commands and prompts

Agent Skills and AGENTS.md: **Not supported** as structured slash-command/prompt-file types. Whether a consuming tool exposes skills as commands or replaces commands with skills is **UNKNOWN from these standards**. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [AGENTS.md](https://agents.md/).

MCPB declares prompts inline in root `manifest.json`; these are MCP prompt templates, **not a standardized slash-command directory**. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

| Key | Type | Required | Meaning |
|---|---|---|---|
| `prompts` | array<object> | No | Declared prompts. |
| `prompts[].name` | string | Yes | Prompt identifier. |
| `prompts[].description` | string | No | Description; localizable. |
| `prompts[].arguments` | string[] | No | Argument names; no per-argument description/type/required flag here. |
| `prompts[].text` | string | Yes | Template text; documented example uses `${arguments.topic}`. |
| `prompts_generated` | boolean | No | Additional runtime-generated prompts; documented default false. |

[Types](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts), [semantics and interpolation example](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

Shell/file interpolation, positional placeholders, model overrides, tool overrides, invocation UI, and argument escaping are **UNKNOWN**; no corresponding MCPB schema fields. [Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

## Hooks

**Not supported** by these formats: no lifecycle events, matchers, hook handler types, payloads, exit-code decisions, timeout fields, hook environment variables, ordering or hook scopes. Skill scripts and MCP server executables are not lifecycle hook declarations. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [AGENTS.md](https://agents.md/), [MCPB schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

## MCP servers

Agent Skills and AGENTS.md: **Not supported** as structured server configurations. A compatibility statement or Markdown reference is not an MCP registration. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [AGENTS.md](https://agents.md/).

MCPB packages **one local MCP server** under root `manifest.json` → `server`; README recommends stdio. It is not a general remote-server config format. [README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md), [schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

| Key | Type | Required | Meaning |
|---|---|---|---|
| `server` | object | Yes | Local server launch configuration. |
| `server.type` | enum | Yes | 0.3: `python`, `node`, `binary`; implemented 0.4 adds `uv`. |
| `server.entry_point` | string | Yes | Path to server entry file. |
| `server.mcp_config` | object | Yes in strict schemas | Launch configuration; **docs say optional for `uv`, conflicting with schema**. |
| `server.mcp_config.command` | string | Yes | Executable command. |
| `server.mcp_config.args` | string[] | No | Arguments. |
| `server.mcp_config.env` | map<string,string> | No | Environment entries. |
| `server.mcp_config.platform_overrides` | map<string,object> | No | Platform-keyed launch overrides. |
| `platform_overrides.<platform>.command` | string | No | Replaces base command. |
| `platform_overrides.<platform>.args` | string[] | No | Replaces entire base argument list. |
| `platform_overrides.<platform>.env` | map<string,string> | No | Merges over base environment entries. |

[0.3 schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.3.ts), [0.4 schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts), [override implementation](https://github.com/modelcontextprotocol/mcpb/blob/main/src/shared/config.ts).

Platform keys are schema-level arbitrary strings; documented platforms are `darwin`, `win32`, `linux`. Runtime override selection uses `process.platform`. Documentation says clients automatically append `.exe` for binaries on Windows; enforcement across hosts is **UNKNOWN**. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [implementation](https://github.com/modelcontextprotocol/mcpb/blob/main/src/shared/config.ts).

**No dedicated fields:** `cwd`, `envFile`, server `url`, `headers`, transport selector, OAuth/auth configuration, timeouts, tool enable/disable lists, or trust policy. Generic `user_config` can collect an API key but does not define an authentication protocol. [Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

**Substitution:**

| Syntax | Meaning |
|---|---|
| `${__dirname}` | Absolute bundle installation directory; MCPB’s package-root variable. |
| `${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`, `${DOWNLOADS}` | Host-supplied system directories. |
| `${pathSeparator}`, `${/}` | Platform path separator. |
| `${user_config.KEY}` | Effective configured value. |
| `${locale}` | Localization resource filename placeholder, separate from server launch variables. |

[Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

Implementation recursively substitutes string values in objects/arrays. User values override defaults; booleans become `"true"`/`"false"` and scalar values become strings. A standalone `${user_config.KEY}` array element expands an array value into separate elements; embedding array values in a string warns and leaves the placeholder. Unrecognized placeholders remain unchanged. No `${CLAUDE_PLUGIN_ROOT}` equivalent is defined beyond `${__dirname}`. [Implementation](https://github.com/modelcontextprotocol/mcpb/blob/main/src/shared/config.ts).

**Required-config pitfall:** launch generation checks required values against supplied `userConfig` **before merging defaults**. A required field with a manifest default can still prevent generation if absent from supplied values. Missing/null/empty-string values, empty arrays, or arrays containing invalid values fail this check. [Implementation](https://github.com/modelcontextprotocol/mcpb/blob/main/src/shared/config.ts).

Install scopes, configuration-file path, and cross-source server precedence are **UNKNOWN** at the bundle-format layer. Docs say hosts generate MCP configuration in user settings without prescribing the settings filename. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

## Other native capability types

MCPB supports executable local server code and bundled dependencies/assets, tool inventory, prompt templates, configurable UI inputs, localization, and namespaced integration metadata. These are not agent extension modules or lifecycle hooks. [README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md), [schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

| Key | Type | Meaning |
|---|---|---|
| `tools` | array<object> | Static tool inventory. |
| `tools[].name` | string, required | Tool name. |
| `tools[].description` | string, optional | Localizable description. |
| `tools_generated` | boolean, optional | Additional runtime-generated tools; documented default false. |
| `_meta` | map<string,map<string,any>>, optional | Namespaced platform/client integration data. Prose requests reverse-DNS namespaces; strict schema does not enforce namespace syntax. |

[Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts), [manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

`_meta["com.microsoft.windows"]` examples include `package_family_name` and `static_responses` containing MCP `initialize` and `tools/list` responses. These examples are **not fixed core fields**; arbitrary nested content remains permitted. Full tool input/output schemas appear inside that example, not in core `tools[]`. [Manifest example](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

**User configuration:** `user_config` is an optional map from configuration name to the following object. [Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `type` | `string` \| `number` \| `boolean` \| `directory` \| `file` | Yes | UI/input kind. |
| `title` | string | Yes | UI label. |
| `description` | string | Yes | Help text. |
| `required` | boolean | No | Required input; documented default false. |
| `default` | string \| number \| boolean \| string[] | No | Default; variable substitution documented. |
| `multiple` | boolean | No | Multiple directory/file selections; documented default false. |
| `sensitive` | boolean | No | Mask/store string input securely; documented default false. |
| `min`, `max` | number | No | Numeric limits. |

[Types](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts), [semantics](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

Strict schema does not discriminate these options by `type`: it does not prohibit `min` on strings or a string default on numeric options. UI enforcement is **UNKNOWN**. [Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

**Not supported as native package declarations:** LSP servers, output styles, application themes, monitors, models/providers, statusline, keybindings, and host JS/TS extension APIs. Icons with theme labels are assets, not UI themes. Apps/connectors may be implemented through MCP server code but have no separate capability declaration. [Complete schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

## Permissions, trust and security

Agent Skills’ **experimental** `allowed-tools` expresses preapproval, not a universal permission engine. Neither `compatibility` nor script inclusion grants OS sandbox permissions. AGENTS.md supplies instructions, not enforceable permission policy. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [AGENTS.md](https://agents.md/).

MCPB has no package fields for allow/deny/ask policy, workspace trust, sandbox configuration, mandatory enterprise installation, or overriding host policy. `user_config.sensitive` requests masked/secure handling; `privacy_policies` lists external-service policy URLs and is documented as required when services process user data, although the schema makes it optional. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

**Implemented signing tooling:**

- `mcpb sign`: X.509 PEM certificate and matching private key; optional intermediate certificates; supports self-signed development certificates.
- `mcpb verify`: reports validity, certificate subject/issuer, validity dates, fingerprint, self-signed warning.
- Signature format: detached DER PKCS#7 SignedData appended to archive, framed by `MCPB_SIG_V1`, four-byte little-endian length, and `MCPB_SIG_END`; archive content excluding signature block is signed.
- Unsigned ZIP bundles remain valid; `mcpb unsign` removes signature.
- Code-signing extended key usage is recommended.

[CLI documentation](https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md).

README documents an installation dialog when opening a bundle in Claude for macOS/Windows. Exact trust-prompt wording, signature enforcement, workspace trust, sandboxing, provenance attestations beyond certificate signing, and managed/enterprise restrictions are **UNKNOWN from the inspected format sources**. [README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md).

## Packaging, install and scopes

**Agent Skills:** directory with required `SKILL.md`; optional arbitrary contents. No standardized repository-level manifest, marketplace schema, source locator, dependencies, semantic-version field, install registry, update mechanism, lockfile, or cache path. `metadata.version` is arbitrary string metadata, not package-resolution semantics. [Specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx).

**AGENTS.md:** repository Markdown file, optionally nested; no package/marketplace/install manifest. [Official site](https://agents.md/).

**MCPB:** `.mcpb` ZIP archive containing root `manifest.json` and local server files/dependencies. Former name **DXT**; `.dxt` and `dxt` tooling renamed to `.mcpb` and `mcpb`. [README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md).

**Complete root manifest fields:** optional unless marked required. Types below reflect implemented strict schemas; semantic guidance may be narrower. [0.3 schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.3.ts), [0.4 schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

| Field | Type | Meaning |
|---|---|---|
| `$schema` | string | Optional schema reference. |
| `manifest_version` | version literal | Format version; either this or deprecated `dxt_version` required. |
| `dxt_version` | version literal | Deprecated alternative; must match selected schema version. |
| `name` | string, required | Machine-readable identifier; strict schema has no identifier regex. |
| `display_name` | string | Human-facing name; localizable. |
| `version` | string, required | Prose specifies semver; schema does not enforce semver. |
| `description` | string, required | Brief description; localizable. |
| `long_description` | string | Detailed Markdown description; localizable. |
| `author` | object, required | Author record. |
| `author.name` | string, required | Author name; localizable. |
| `author.email` | email string | Contact email. |
| `author.url` | URL string | Author URL. |
| `repository` | object | Source repository information. |
| `repository.type` | string, required within object | Repository kind, e.g. `git`; not an enum. |
| `repository.url` | URL string, required within object | Source URL; not an install-source/ref declaration. |
| `homepage` | URL string | Homepage. |
| `documentation` | URL string | Documentation. |
| `support` | URL string | Support/issues. |
| `icon` | string | PNG path or HTTPS URL in prose; legacy single icon. |
| `icons` | object[] | Multiple icon variants. |
| `icons[].src` | string, required | Asset source. |
| `icons[].size` | string, required | Must match digits `x` digits, e.g. `128x128`. |
| `icons[].theme` | nonempty string | Theme label; arbitrary string, not a `light`/`dark` enum. |
| `screenshots` | string[] | Screenshot paths. |
| `localization` | object | Translation resource configuration. |
| `localization.resources` | string | `${locale}`-containing path; required in strict object; prose says optional, default `mcpb-resources/${locale}.json`. |
| `localization.default_locale` | string | BCP47-like validated locale; required in strict object; prose says optional, default `en-US`. |
| `server` | object, required | Fields inventoried under MCP servers. |
| `tools`, `tools_generated` | object[], boolean | Fields inventoried under other capabilities. |
| `prompts`, `prompts_generated` | object[], boolean | Fields inventoried under commands and prompts. |
| `keywords` | string[] | Search terms; localizable. |
| `license` | string | License identifier. |
| `privacy_policies` | URL[] | External-service policies; conditional prose requirement. |
| `compatibility` | object | Host/platform/runtime constraints. |
| `compatibility.claude_desktop` | string | Client semver constraint; not validated as semver. |
| `compatibility.platforms` | (`darwin` \| `win32` \| `linux`)[] | Supported OSes; omitted means all in prose. |
| `compatibility.runtimes` | object | Required runtime versions. |
| `compatibility.runtimes.python` | string | Python version constraint. |
| `compatibility.runtimes.node` | string | Node version constraint. |
| `user_config` | map<string,object> | Fields inventoried under other capabilities. |
| `_meta` | map<string,map<string,any>> | Opaque namespaced integration metadata. |

[Schema for all rows](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts), [semantic definitions](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

**Localization:** default-language strings stay in manifest; locale files supply overrides. Clients should ignore localized prompts/tools absent from manifest and use appropriate locale fallbacks. Resource paths are relative to server installation directory. Legacy `icon` is fallback when `icons` is omitted. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).

**Layout/dependencies:**

| Server kind | Documented contents |
|---|---|
| `node` | JavaScript entry point; bundled `node_modules/`; usually root `package.json`. |
| `python` | Python entry point; bundled dependencies such as `server/lib/` or `server/venv/`; runtime requirement in compatibility. |
| `binary` | Self-contained executable and necessary libraries; may include platform-specific binaries. |
| `uv` | Implemented 0.4 type; `pyproject.toml`, source entry point; docs require no `server/lib/` or `server/venv/`; host installs dependencies using UV. |

[README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md), [manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [0.4 schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

There is no bundle-to-bundle dependency field. `package.json`/`pyproject.toml` dependencies concern server execution, not transitive capability imports. [Complete manifest schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

**Build/install tooling:** `npm install -g @anthropic-ai/mcpb`; `mcpb init` creates manifest; `mcpb validate` validates it; `mcpb pack` creates compressed archive. Opening archive in Claude macOS/Windows presents installation dialog. CLI documents no universal install/enable registry. [CLI](https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md), [README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md).

**Packing exclusions:** defaults include `.git/`, `.gitignore`, `.DS_Store`, `Thumbs.db`, logs, npm/yarn metadata, `.pnp.*`, `node_modules/.cache/`, `node_modules/.bin/`, `*.map`, `.env.local`, `.env.*.local`, `package-lock.json`, `yarn.lock`. Root `.mcpbignore` adds gitignore-like exclusions. **Pitfall:** default exclusions are not documented as excluding every `.env` file; sensitive files need deliberate exclusion. [CLI](https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md).

README reports **shipped Claude macOS/Windows support**, automatic updates and a curated directory. It does not define a portable catalog schema, update URL field, update selection algorithm, exact extraction/cache path, user/project/local/org precedence, or keys such as `enabledPlugins`. Those are **UNKNOWN**. Git refs/SHAs, npm package locators and marketplace source objects are **not MCPB manifest fields**; ZIP is the bundle artifact and repository URL is metadata. [README](https://github.com/modelcontextprotocol/mcpb/blob/main/README.md), [schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).

## Notable gaps and ambiguities

- **Temporal evidence limitation:** direct requests to agentskills.io and agents.md fell back to archive snapshots dated **2026-10-02** and **2026-10-07**, respectively—after the requested 2026-10-01 cutoff. Skills fields were corroborated against official repository source; AGENTS.md website claims are not independently pinned to an on-or-before-cutoff revision. Current `main` repository evidence likewise was not historically cutoff-pinned.
- **MCPB version/status mismatch:** manifest document says current 0.3 and 2025-12-02; repository implements 0.4 and package 2.1.2. 0.3 schema still carries a “WIP…not yet finalized” comment. Treat this as conflicting documentation, not proof all 0.4 features are shipped in every host. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [0.3](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.3.ts), [0.4](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).
- **UV configuration conflict:** docs allow absent `mcp_config` for UV, strict 0.4 schema requires it. **Localization conflict:** docs supply defaults for omitted nested fields, strict schemas require both nested fields when object exists. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).
- **Compatibility extensibility conflict:** prose allows arbitrary client-name version constraints; strict 0.3/0.4 schemas permit only `claude_desktop`, `platforms`, `runtimes`. An otherwise documented custom client key fails strict validation. [Manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md), [schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts).
- **Lossless round-trip risk:** MCPB strict objects reject unknown keys, while `_meta` deliberately preserves arbitrary data. Retain original manifest version, deprecated spelling, opaque `_meta`, locale files, assets and server payload; normalizing them away cannot be lossless. Skill bodies/arbitrary files and arbitrary `metadata` likewise require preservation. [MCPB schema](https://github.com/modelcontextprotocol/mcpb/blob/main/src/schemas/0.4.ts), [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx).
- **No common package permissions semantics:** experimental skill `allowed-tools`, MCPB sensitive UI inputs, and host security policy have different meanings; they must not become one contradictory field. [Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx), [MCPB manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).
- **Remaining coverage:** tool-specific skill extensions/discovery, enterprise host policy, exact host installation files/cache, earlier MCPB 0.1/0.2 field differences, and historical cutoff pinning were not established. The most useful follow-up is cutoff-pinned source inspection plus separate consuming-tool inventories; do not infer those contracts from these three formats.
