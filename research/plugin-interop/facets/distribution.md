# Facet: packaging, install and scopes (distribution)

Snapshot 2026-10-01. Inputs: every inventory in `../tools/*.md` (their citations are the evidence), `../advice-core-vs-extras.md`, `SPEC.md` §§3-4, 7, 14.4, 17-22, `CONTEXT.md` Axiom 12, `packages/core/src/types/model.ts`, `packages/core/src/targets/{registry,extensions}.ts`, `packages/core/src/schemas/index.ts`, `packages/adapters/src/**`, `packages/installer/src/**`.

Spot-verified against live official docs during this pass (2026-10-01): Claude `plugins-reference` confirms `displayName`, `defaultEnabled` (marketplace entry overrides manifest; persisted `enabledPlugins` survives later `defaultEnabled` changes), `dependencies` entries as `"name"`, `"name@marketplace"` or `{name, marketplace, version}`, `userConfig`, `channels`, `workflows`, and that `icon`/`documentationUrl`/`supportUrl`/`privacyPolicyUrl`/`termsOfServiceUrl` are directory-listing fields Claude ignores at load time; `plugin-marketplaces` confirms the `git-subdir` source with `url` accepting `owner/repo`. The locally installed Claude is 2.1.97; whether these rolling-doc fields exist in that build was **not** verified.

Notation used in tables: `N(x)` native, spelled `x`; `T(...)` translated losslessly by a writer or installer; `D(...)` degraded with a diagnostic; `U` unsupported (field dropped with `acf.distribution.field-unsupported`, severity `lossy`); `?` unknown in the inventories (treated as `U` until verified).

---

## 0. Scope of this facet and its boundary

This facet owns four layers that today's ACF collapses into `acf.yml` metadata plus `capabilities.yml`/`capabilities.lock`:

| Layer | What it is | Who authors it | ACF today |
|---|---|---|---|
| **Package metadata** | Identity, version, listing metadata, dependencies, install-time options of one package | Package author | `acf.yml` §4.2 (partial) |
| **Package layout** | Which manifest file(s), where components live, path-override and discovery rules | Package author / format | Fixed ACF layout §3; foreign layouts unsupported |
| **Catalog** | A marketplace/registry listing many packages with per-entry source descriptors and listing overrides | Catalog owner | None (an `acf/` collection is the nearest thing) |
| **Consumer install state** | Which sources a consumer selects, at which scope, pinned how, enabled or not, with which option values; the native files written to realize that | Consumer (via caplet) | `capabilities.yml`, `capabilities.lock`, `.acf-managed.json`; loose-file emission only |

Component semantics (skills, agents, hooks, MCP, LSP, settings defaults) belong to their own facets. This facet only covers how a package *declares where they are*, and the package-scoped placeholders (`plugin root`, `plugin data`, `option values`) those facets reference.

---

## 1. Concept map

Each row is one meaning. "Spellings" lists every tool that has the meaning and how it spells it. Rows marked **(conflict)** have the same spelling with different meanings, or same meaning with incompatible contracts; see §4.

### 1.1 Package metadata

| # | Meaning | Spellings | Notes |
|---|---|---|---|
| M1 | Stable package identifier | ACF `name` (slug `^[a-z0-9]+(-[a-z0-9]+)*$`, no length cap); Agent Plugins (AP) `name` (1-64, `[a-z0-9.-]`, alnum ends, no `--`/`..`) used by Codex, Copilot, VS Code, Cursor (AP lane), Kiro, Cline, Devin; Claude `name` (reserved names, no published regex); Cursor `.cursor-plugin` `name` (lowercase alnum/`-`/`.`); Copilot legacy `name` (kebab, ≤64); Gemini `name` (lowercase/digit/dash, must equal install dir); Devin `name`; Goose `name` (optional, inferred from dir); MCPB `name` (no regex); Lume `id` (1-128, `^[a-z0-9][a-z0-9-_.]*$`); npm `name` for Pi/OpenCode/Cline code packages (may be `@scope/x`) | Charsets differ (dots, underscores, scopes, length). npm scope is a distribution coordinate, not a plugin name. |
| M2 | Human display name | Claude `displayName` (manifest; marketplace entry wins); Codex `extensions.com.openai.interface.displayName`; Devin `displayName` (observed in official source); MCPB `display_name`; Lume `displayName` (≤64); Kiro legacy `POWER.md displayName` | AP 1.0 has none. |
| M3 | Package version | ACF `version` (required SemVer); AP `version` (optional, SemVer recommended); Claude `version` (optional; update/cache identity; fallback short commit or archive hash); Codex `version` (cache path segment, `local` for local); Copilot, Cursor, Devin `version`; Gemini `version` (required); Goose `version` (optional, `"unknown"`); MCPB `version` (required); Lume `extensionVersion` (required, not SemVer); npm `version` (Pi/OpenCode/Cline) | **(conflict)** what version *does* differs (see §4 C7). |
| M4 | Short description | `description` everywhere that has a manifest (ACF, AP, Claude, Codex, Copilot ≤1024, Cursor, Gemini (documented; absent from source interface), Devin, MCPB, npm); Codex also `interface.shortDescription` (≤30) | Codex `shortDescription` is a separate subtitle meaning (Codex-only). |
| M5 | Long description | Codex `interface.longDescription` (≤4000); MCPB `long_description` (Markdown, localizable) | Two formats share it. |
| M6 | Author/publisher people | ACF `authors: string[]` (`"Name <email>"`); AP/Claude/Codex/Copilot/Devin/Kiro `author {name?, email?, url?}` (single; AP allows `{}`); Cursor `author {name (req), email?}`; Copilot legacy `author.name` required; MCPB `author {name (req), email?, url?}`; Kiro legacy `author: string`; Codex `interface.developerName`; npm `author` + `contributors[]` | Cardinality conflict: ACF many vs most tools one. |
| M7 | Homepage | `homepage` (ACF, AP, Claude, Codex root, Copilot, Cursor, Devin, MCPB, npm); Codex `interface.websiteURL` | Codex has both root `homepage` and `interface.websiteURL` in one package; both must round-trip. |
| M8 | Source repository (metadata, not install source) | `repository` string (ACF, AP, Claude, Codex, Copilot, Cursor, Devin); MCPB `repository {type, url}`; npm `repository` string or `{type, url, directory}` | AP explicitly says it is not an install-source descriptor. |
| M9 | License | `license` (ACF SPDX; AP/Copilot/Kiro SPDX recommended; Claude, Cursor, Devin, MCPB, npm) | |
| M10 | Discovery keywords | `keywords` (ACF lowercase, AP, Claude, Codex, Copilot, Cursor, Devin, MCPB, npm/Pi with `pi-package` gallery keyword) | **(conflict)** Kiro also uses `keywords` as activation triggers (§4 C13). Gemini gallery uses GitHub repo topic `gemini-cli-extension`, not a manifest field. |
| M11 | Tags (distinct from keywords) | Claude marketplace entry `tags`; Copilot legacy manifest and entry `tags`; Cursor entry `tags` | Copilot carries `keywords` and `tags` side by side, so they are not aliases. |
| M12 | Category | Claude entry `category`; Copilot legacy `category`; Cursor entry `category`; Codex `interface.category` and catalog entry `category` | Free text; no exhaustive enum documented anywhere. |
| M13 | Icon / logo | Claude `icon` (directory listing only); Cursor `logo` (path or URL; relative resolved via raw GitHub URL); Devin `logo`; Codex `interface.logo`, `logoDark`, `composerIcon`, `composerIconDark`; MCPB `icon`, `icons[] {src, size "WxH", theme}` | Theme variants exist in Codex and MCPB. Composer icon is Codex-only. |
| M14 | Screenshots | Codex `interface.screenshots`; MCPB `screenshots` | |
| M15 | Documentation / support / privacy / terms URLs | Claude `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl` (listing only, ignored at load); Codex `interface.supportURL`, `privacyPolicyURL`, `termsOfServiceURL`; MCPB `documentation`, `support`, `privacy_policies[]` | MCPB privacy is a list (one per external service). |
| M16 | Default activation after install | Claude `defaultEnabled` (manifest and entry; default `true`); Gemini enablement default true; Goose default enabled | Package-level default only in Claude. Distinct from M17. |
| M17 | Catalog install policy | Codex entry `policy.installation` (`AVAILABLE`, `INSTALLED_BY_DEFAULT`, `NOT_AVAILABLE`); Cursor team distribution modes (`Default Off`, `Default On`, `Required`; dashboard state); Devin governance `requiredPlugins` / `optionalPlugins` at enterprise/org/repo | Install vs enable differ from M16. |
| M18 | Package-to-package dependency | Claude `dependencies` (name / `name@marketplace` / `{name, marketplace?, version?}`; transitive install+enable; semver tag resolution for git); Devin `requiredPlugins: source[]` (recursive auto-install; sha/ref pins); ACF `capabilities.yml` (consumer-side only, no transitive) | Different reference models (by catalog name vs by source). |
| M19 | Endorsed optional packages | Devin `optionalPlugins` (not installed automatically; doubles as the official catalog) | Devin-only. |
| M20 | Forbidden packages | Devin `forbiddenPlugins` (identity/path/glob; governance) | Devin-only. |
| M21 | Host compatibility constraint | OpenCode `package.json engines.opencode` (semver range, checked for npm); MCPB `compatibility.claude_desktop`; Lume `hostContract` (integer contract range, not host version) | Lume's is a different meaning (API contract id). |
| M22 | Platform / runtime constraints | MCPB `compatibility.platforms`, `compatibility.runtimes.{node,python}`; Gemini GitHub-release asset selection `{platform}.{arch}.{name}` | Gemini's is asset selection, not a constraint. |
| M23 | Install-time options requested from the user | Claude `userConfig` (key → `{type, title, description, required, default, options, multiple, sensitive, min, max}`); MCPB `user_config` (same shape minus `options`); Gemini `settings[] {name, description, envVar, sensitive}`; Cursor `variables` (restricted JSON Schema, admin-configured in dashboard) | Delivery differs: Claude `${user_config.KEY}` + `CLAUDE_PLUGIN_OPTION_<KEY>` env; MCPB `${user_config.KEY}`; Gemini env var. |
| M24 | Package root path at runtime | AP `${PLUGIN_ROOT}`; Claude `${CLAUDE_PLUGIN_ROOT}`; Cursor `${CURSOR_PLUGIN_ROOT}` (also expands `${CLAUDE_PLUGIN_ROOT}`, **not** `${PLUGIN_ROOT}`); Copilot `${PLUGIN_ROOT}`/`${COPILOT_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_ROOT}` (agent frontmatter); Codex `PLUGIN_ROOT` + `CLAUDE_PLUGIN_ROOT` env for hooks; MCPB `${__dirname}`; ACF `${ACF_CAPABILITY_DIR}` / `${ACF_PACKAGE_DIR}` (substituted to an absolute path at emit time) | Expansion sites differ per tool (owned by MCP/hook facets). |
| M25 | Persistent per-package data dir | AP `${PLUGIN_DATA}` (required for subprocess-capable clients, preserved across updates); Claude `${CLAUDE_PLUGIN_DATA}` → `~/.claude/plugins/data/<id>/`; Codex `PLUGIN_DATA`; Copilot `$COPILOT_PLUGIN_DATA` → `~/.copilot/plugin-data/`; Lume `<state>/extension-storage/<id>/{global,workspaces,sessions}` | ACF has no equivalent. |
| M26 | Opaque namespaced vendor data | AP `extensions["reverse.domain"]` + `<root>/<reverse.domain>/` directory; Claude `metadata` (arbitrary object); MCPB `_meta` (namespaced map); ACF `targets.<target>` | **(conflict)** Copilot legacy `extensions` means executable extension paths (§4 C1). |
| M27 | Format identification | AP `$schema` exact URL (1.0.0; Copilot also 1.1.0); Claude `$schema` (ignored at load); MCPB `manifest_version` / `dxt_version`; Lume `version: 1`; ACF `acf: 1`; Gemini/Goose/Devin/Cursor: file location | |
| M28 | Component location declarations | Claude `skills`(additive) / `commands`,`agents`,`outputStyles`,`workflows`(replace) / `hooks`,`mcpServers`,`lspServers`(merge); Cursor all replace; Copilot legacy paths; Devin `skills` (replace, `[]` disables), `mcpServers {paths, exclusive}`; Goose `{paths, exclusive}`; Pi `pi.{extensions,skills,prompts,themes}` globs with `!`; Gemini `contextFileName`; Codex overlay `skills`/`mcpServers`/`hooks`/`apps`; AP: fixed (`skills/`, `mcp.json`) | **(conflict)** additive vs replace vs exclusive (§4 C3). |
| M29 | Source relocation / rename | Claude catalog `renames {old: new\|null}`; Gemini `migratedTo` (new source URL; migrates settings) | Different meanings (name vs source). |

### 1.2 Catalogs (marketplaces)

| # | Meaning | Spellings |
|---|---|---|
| K1 | Catalog file | Claude `.claude-plugin/marketplace.json`; Copilot lookup `marketplace.json` → `.plugin/marketplace.json` → `.github/plugin/marketplace.json` → `.claude-plugin/marketplace.json`; Cursor `.cursor-plugin/marketplace.json` (≤10 MB); Codex `$REPO/.agents/plugins/marketplace.json`, `~/.agents/plugins/marketplace.json` (desktop also legacy `.claude-plugin/marketplace.json`); Devin: a `.devin-plugin/plugin.json` with `skills: []` and `optionalPlugins`; OpenCode skill index `<base>/index.json` (skills only); Gemini gallery crawl + `experimental.extensionRegistryURI` JSON (schema unknown); VS Code consumes Claude/Copilot formats |
| K2 | Catalog identity | `name` (Claude, Copilot ≤64 kebab, Cursor, Codex) |
| K3 | Catalog display name | Codex `interface.displayName` |
| K4 | Catalog owner | Claude `owner {name, email?, url?}` (required); Copilot/Cursor `owner {name, email?}` (required) |
| K5 | Catalog description / version | Claude top-level `description`, `version` **and** `metadata.description`, `metadata.version`; Copilot/Cursor `metadata.description`, `metadata.version` |
| K6 | Relative source prefix | `metadata.pluginRoot` (Claude, Copilot, Cursor) |
| K7 | Entry identity and source | `plugins[].name`, `plugins[].source` (all catalog formats) |
| K8 | Entry listing overrides | Claude: `description, version, category, tags, displayName, metadata, defaultEnabled, dependencies` + component fields; Copilot: `description, version, homepage, repository, license, category, author, keywords, tags` + component fields; Cursor: `description, version, homepage, repository, license, logo, category, author, keywords, tags, variables` + component fields; Codex: `category`, `policy` |
| K9 | Entry/manifest combination | Claude `strict` (default true: additive, hooks replace by event; false: entry may define plugin, conflicts can fail); Copilot `strict` (false relaxes legacy validation); Cursor: manifest wins | 
| K10 | Entry install/auth policy | Codex `policy.installation`, `policy.authentication` |
| K11 | Download auth | Claude entry `headers`, `headersHelper`; Claude `url` marketplace source `headers`, `headersHelper` |
| K12 | Catalog behavior flags | Claude `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`; Claude entry `relevance {topic, signals}` |

### 1.3 Source descriptors (where a package or catalog comes from)

| # | Meaning | Spellings |
|---|---|---|
| S1 | Local directory | ACF `path:` (relative to `capabilities.yml` dir); Claude relative string (to marketplace root, or `pluginRoot`); Codex `{source: "local", path}` (relative to marketplace **root**, not catalog dir); Copilot relative string (marketplace repo root; `./` optional); Cursor `source` path; Pi local path (relative to owning settings file; not copied); Gemini local path (copied) / `link`; Lume `./dir` (relative to config dir); Cline local; OpenCode `file://` / `.` / absolute; Devin `--local` (live link); Kiro local directory; VS Code `chat.pluginLocations` |
| S2 | GitHub repo | ACF `github:owner/repo`; Claude `{source:"github", repo, ref?, sha?}`; Copilot `{source:"github", repo, ref?, sha?, path?}`; Devin `{source:"github", repo, sha\|ref, path?}` and `owner/repo` string; Codex CLI `owner/repo[@ref]`; VS Code `owner/repo`; Kiro public GitHub repo |
| S3 | Arbitrary git URL | ACF `git:<url>`; Claude `{source:"url", url, ref?, sha?}`; Codex `{source:"url", url, ref?, sha?}`; Copilot `{source:"url", …}` (URL property spelling unknown); Devin `{source:"url", url}`; Pi `git:host/path@ref` and protocol URLs; Gemini git URL `--ref`; Goose git (no ref); Cline `git…@ref` |
| S4 | Subdirectory inside a git source | ACF entry `path`; Claude `{source:"git-subdir", url (git URL or owner/repo), path, ref?, sha?}`; Codex `git-subdir` `path`; Copilot github `path`; Devin `path` / `#subdirectory` |
| S5 | Floating selector | ACF `ref` (branch/tag/SHA, required for git); Claude/Codex/Copilot `ref`; Devin `ref` (mutually exclusive with `sha`); Gemini `--ref`; Pi `@ref` |
| S6 | Immutable commit pin | Claude/Codex `sha`; Copilot `sha` (full 40 hex); Devin `sha`; ACF lock `resolvedSha` (and `ref` may itself be a SHA) |
| S7 | npm package | Claude `{source:"npm", package, version?, registry?}`; Codex same; Pi `npm:@scope/pkg@1.2.3`; OpenCode npm spec (`npm-package-arg`; bare → `@latest`); Cline npm spec; VS Code external npm (and PyPI) sources |
| S8 | Archive URL with digest | Claude `{source:"archive", url (https), sha256?}`; Gemini GitHub-release `.tar.gz`/`.zip` assets with platform selection; Devin web ZIP upload (`account-upload`, `bundleId`, `bundleScope`); MCPB `.mcpb` ZIP artifact |
| S9 | Command-produced source | Claude `{source:"command", command, timeout?, mode: copy\|link}` |
| S10 | Single remote code file | Cline HTTPS `.ts`/`.js`; Amp `amp plugins add <URL>` |
| S11 | Catalog source (where a marketplace comes from) | Claude: `url` (JSON), `github {repo, ref?, path?, sparsePaths?}`, `git {url, ref?, path?, sparsePaths?}`, `file`, `directory`, `settings` (inline); Codex `[marketplaces.<n>] source_type git\|local, source, ref, sparse_paths` + CLI `--sparse`; Copilot `extraKnownMarketplaces.<n>.source`; VS Code `chat.plugins.marketplaces: string[]` (+ `file:///`), `extraKnownMarketplaces` |
| S12 | Sparse checkout paths | Claude `sparsePaths`; Codex `sparse_paths` / `--sparse` |

### 1.4 Install, activation, scope, update

| # | Meaning | Spellings |
|---|---|---|
| I1 | Activation record ("package X enabled in scope S") | Claude `enabledPlugins["p@m"]: boolean` in `settings.json` / `settings.local.json`; Copilot `enabledPlugins` map (true = enable + auto-install); VS Code `enabledPlugins` map **as recommendation** in `.claude/settings.json` / `.github/copilot/settings.json`, `chat.pluginLocations {path: bool}`; Codex `[plugins."p@m"] enabled = bool` in `config.toml`; Goose `enabledPlugins: string[]` + `disabledPlugins: string[]` and `config.yaml plugins: {abs-path: {enabled}}`; Gemini `extension-enablement.json {name: {overrides: string[]}}` (`!` disables, trailing `*` descendants, last match wins); Cline `disabledPlugins`, `disabledAgentPlugins`; Pi `settings.json packages[]` presence + per-resource filters; OpenCode `plugin[]`; Lume `extensions[]` |
| I2 | Catalog registration | Claude `extraKnownMarketplaces {name: {source, autoUpdate?}}` (alias `additionalMarketplaces`) + `~/.claude/plugins/known_marketplaces.json`; Copilot `extraKnownMarketplaces`; Codex `[marketplaces.<n>]`, catalog file discovery; VS Code `chat.plugins.marketplaces`, `extraKnownMarketplaces` |
| I3 | Installed identity key | `name@marketplace` (Claude, Codex, Copilot, VS Code); Gemini `name`; Goose absolute path; Pi npm name / git URL without ref / resolved path; Lume `id`; ACF `(scope, capability name)` + `sourceId` |
| I4 | Scopes | Claude user / project / local / managed (+ session `--plugin-dir`); Copilot user / repository / local / managed (+ `--plugin-dir`); Codex user / trusted project (root-to-CWD) / profile / cloud-managed / system / workspace-admin; Gemini install user-only, enablement user/workspace (workspace stored centrally, private to the machine); Goose user / project / local; Cursor user / project / team (UI); Devin user (cloud-synced) / `--local` machine / repo / org / enterprise; Pi user / trusted project / temporary `-e`; OpenCode remote-org / global / env / project / `.opencode` / managed; Amp project / system / personal hosted / workspace hosted; Cline global (AP lane) / project (code lane); Lume app-wide only; ACF user / project |
| I5 | Scope precedence | Claude managed > CLI > local > project > user; Copilot managed > local > repository > user (repo-only enables are repo-scoped); Codex CLI > project (closest) > profile > user > cloud-managed > system, workspace-admin state not overridable; Gemini system overrides > project > user > system defaults; Goose local > project > user, disabled wins within scope; OpenCode later wins (managed last); Pi project > user (`autoload:false` is a delta); Devin enterprise > org > repo > user, deny wins; Amp project > system > personal hosted > workspace hosted; Cursor marketplace-installed same name beats local dev copy; ACF project shadows user per `(family, name)`, in-scope collision is an error |
| I6 | Payload location / cache | Claude `~/.claude/plugins/cache/<m>/<p>/<version>/` (local relative-path marketplace plugins load in place), `marketplaces/<m>/`, `data/<id>/`, `installed_plugins.json`; Codex `~/.codex/plugins/cache/<m>/<p>/<version\|local>/`; Copilot `~/.copilot/installed-plugins/<m>/<p>`, `_direct/<source-id>/`, `~/.cache/copilot/marketplaces/`; VS Code `~/.config/Code/agentPlugins/github.com/<org>/<repo>` (Linux) + auto-discovers Copilot CLI installs; Cursor `~/.cursor/plugins/local/<p>/` (dev); Gemini `~/.gemini/extensions/<name>/` + `.gemini-extension-install.json`; Goose `~/.agents/plugins/<name>/` + `.goose-plugin-install.json`; Kiro `~/.kiro/powers/installed/<name>/`; Pi `~/.pi/agent/{npm,git}/…`, `.pi/{npm,git}/…`; OpenCode `~/.cache/opencode/packages/<spec>/…`; Cline `~/.cline/plugins/_installed/{npm,git,remote,local}/`, AP lane `~/.agents/plugins/`; ACF `.agents/capabilities/<name>/` + `.agents/.cache/acf-installer/` |
| I7 | Automatic update | Claude per-marketplace `autoUpdate` (official default on); Copilot `autoUpdate` (first-party default true; repository opt-in ignored); Gemini `--auto-update`; Goose `auto_update` (24 h); VS Code `extensions.autoUpdate` (24 h; npm/PyPI need confirmation); Cursor team Auto Refresh (≤ every 10 min); Pi/OpenCode: pinned/reused; ACF: explicit `caplet update` against a lockfile |
| I8 | Update identity | Claude version string (same version may skip refresh); Codex version cache dir; Gemini git remote hash / release tag / local manifest version; Goose re-clone; Pi configured ref; ACF lock `resolvedSha` + `capabilityHash` |

---

## 2. Proposed canonical ACF core schema for this facet

Design rules applied: (a) a field enters the core only when two or more tools or formats carry the same meaning; (b) its type is the union of their shapes (so every native value fits without loss); (c) one meaning per field; (d) values the core cannot hold go to per-target extras (§5) or the per-format remainder.

### 2.1 Package metadata (`acf.yml` top level; also the projection of every foreign manifest)

| Canonical field | Type | Meaning | Origin tools/formats |
|---|---|---|---|
| `name` | `PackageName`: 1-64 chars, `^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$`, no `--`, no `..` (= AP grammar). ACF-authored `acf.yml` keeps the stricter slug as an authoring lint (`warn`, not reject) | Stable package identifier | ACF, AP, Claude, Codex, Copilot, Cursor, Devin, Goose, Gemini, Kiro, MCPB, Lume, npm |
| `displayName` | string, 1-64 | Human label | Claude, Codex, Devin, MCPB, Lume, Kiro-legacy |
| `version` | string; optional on import, required SemVer 2.0.0 for authored `acf.yml` (unchanged rule) | Release identifier of this package | all manifest formats |
| `description` | string | One-paragraph summary | all manifest formats |
| `longDescription` | Markdown string | Detailed description | Codex, MCPB |
| `authors` | `Person[]`; `Person = { name?: string; email?: string; url?: string }`; authoring also accepts the string `"Name <email> (url)"` (npm person syntax; superset of today's `"Name <email>"`) | People/organizations credited, first = primary publisher | ACF, AP, Claude, Codex, Copilot, Cursor, Devin, Kiro, MCPB, npm (`author`+`contributors`) |
| `homepage` | URL string | Project homepage | ACF, AP, Claude, Codex, Copilot, Cursor, Devin, MCPB, npm |
| `repository` | `string \| { url: string; type?: string; directory?: string }` | Source repository metadata (never an install source) | ACF, AP, Claude, Codex, Copilot, Cursor, Devin, MCPB (`{type,url}`), npm (`{type,url,directory}`) |
| `license` | string (SPDX or `LicenseRef-…` recommended; any string accepted on import) | License | all manifest formats |
| `keywords` | string[] | Discovery terms | ACF, AP, Claude, Codex, Copilot, Cursor, Devin, Kiro, MCPB, npm |
| `tags` | string[] | Catalog tags (distinct from keywords) | Claude (entry), Copilot (manifest+entry), Cursor (entry) |
| `category` | string (free text) | Listing category | Claude (entry), Codex, Copilot legacy, Cursor (entry) |
| `icons` | `Icon[]`; `Icon = { src: AssetPath \| https URL; size?: "<w>x<h>"; theme?: string }` (`theme` free text; `light`/`dark` recommended) | Listing images; the first icon without `theme` (or `theme: light`) is primary | Claude `icon`, Cursor `logo`, Devin `logo`, Codex `logo`/`logoDark`, MCPB `icon`/`icons[]` |
| `screenshots` | `AssetPath[]` | Listing screenshots | Codex, MCPB |
| `links.documentation` | URL | Documentation page | Claude `documentationUrl`, MCPB `documentation` |
| `links.support` | URL | Support/issues page | Claude `supportUrl`, Codex `supportURL`, MCPB `support` |
| `links.privacyPolicies` | URL[] | Privacy policies (list because MCPB lists one per external service) | Claude `privacyPolicyUrl`, Codex `privacyPolicyURL`, MCPB `privacy_policies` |
| `links.termsOfService` | URL | Terms of service | Claude `termsOfServiceUrl`, Codex `termsOfServiceURL` |
| `defaultEnabled` | boolean, default `true` | Whether an installed package starts enabled when the consumer has not chosen | Claude (manifest+entry), Gemini/Goose (implicit default) |
| `dependencies` | `Dependency[]` (see 2.3) | Packages that must be installed and enabled for this one to work | Claude `dependencies`, Devin `requiredPlugins` |
| `requires.hosts` | `Partial<Record<TargetId, SemVerRange>>` | Minimum/allowed host versions | OpenCode `engines.opencode`, MCPB `compatibility.claude_desktop` |
| `options` | `Record<OptionKey, OptionDef>`; `OptionKey = ^[A-Za-z_][A-Za-z0-9_]*$` (Claude rule) | Values the consumer must/may supply at install time | Claude `userConfig`, MCPB `user_config`, Gemini `settings[]`, Cursor `variables` |
| `only` / `except` / `targets` | unchanged (§6, §7) | Applicability and per-target extras | ACF |

`OptionDef`:

| Field | Type | Meaning | Origin |
|---|---|---|---|
| `type` | enum `string \| number \| boolean \| directory \| file` | Input kind | Claude, MCPB (identical enum); Gemini implicit `string`; Cursor JSON Schema `type` |
| `title` | string | Prompt label | Claude, MCPB, Cursor `title`, Gemini `name` |
| `description` | string | Help text | Claude, MCPB, Gemini, Cursor |
| `required` | boolean, default false | Must be supplied before activation | Claude, MCPB, Cursor `required[]` |
| `default` | `string \| number \| boolean \| string[]` | Default value | Claude, MCPB, Cursor `default` |
| `choices` | string[] | Fixed choices (single, non-sensitive string) | Claude `options`, Cursor `enum` |
| `multiple` | boolean | List input | Claude, MCPB |
| `sensitive` | boolean, default false | Mask input, store in a secret store, never write into package or shared files | Claude, MCPB, Gemini |
| `min` / `max` | number | Numeric bounds | Claude, MCPB, Cursor ("numeric constraints") |
| `env` | string (env var name) | Expose the value to processes under this name | Gemini `envVar`; Claude exposes `CLAUDE_PLUGIN_OPTION_<KEY>` implicitly |

Option values are referenced from MCP/hook/content facets by a new canonical placeholder `${ACF_OPTION:<key>}` (exact spelling is an open question; MCP and hook facets own expansion sites). Option **values** are consumer state (§2.5), never package content.

Package-scoped path placeholders (owned jointly with MCP/hook facets): keep `${ACF_CAPABILITY_DIR}` as the canonical package root and add `${ACF_CAPABILITY_DATA}` for M25. Writers that produce a real plugin must translate them to the runtime placeholder of the target (`${CLAUDE_PLUGIN_ROOT}`, `${PLUGIN_ROOT}`, `${CURSOR_PLUGIN_ROOT}`) instead of substituting an absolute path, because the install location is owned by the host cache.

### 2.2 Package provenance and layout (model only, not authored in `acf.yml`)

| Canonical field | Type | Meaning |
|---|---|---|
| `sourceFormat` | `{ id: FormatId; version?: string }`, `FormatId = "acf" \| "agent-skills" \| "agent-plugins" \| "claude-plugin" \| "cursor-plugin" \| "copilot-plugin" \| "codex-plugin" \| "gemini-extension" \| "devin-plugin" \| "open-plugins" \| "mcpb" \| "pi-package" …` | Which reader produced the package. Separate from `TargetId`: one format serves many targets |
| `manifests` | `{ path: string; formatId: FormatId; bytesHash: string }[]` | Every manifest file the reader recognized (polyglot packages have several) |
| `remainder` | `Partial<Record<FormatId, NativeRemainder>>`; `NativeRemainder = { manifest?: Record<string, unknown>; catalogEntry?: Record<string, unknown>; files?: string[] }` | Keys and files the reader saw but the core and extras do not model (unknown top-level keys, unknown AP extension namespaces, Claude legacy spellings) |
| `snapshot` | content-addressed reference to the immutable original tree (path, bytes, executable bit) | Basis for byte-identical same-format output when the package is unchanged |

Component location declarations (M28) are **not** core fields: readers resolve them to explicit facet file lists, and the declared form is kept in the format remainder so a same-format writer reproduces it.

### 2.3 Dependencies and sources

`Dependency` (union; one meaning: "must be installed and enabled"):

| Variant | Fields | Origin |
|---|---|---|
| By catalog name | `{ name: PackageName; catalog?: string; version?: SemVerRange }` (absent `catalog` = same catalog as the dependent) | Claude |
| By source | `{ source: SourceDescriptor }` | Devin |

`SourceDescriptor` (one discriminated union used by `capabilities.yml`, catalog entries, dependencies and catalog sources):

| `kind` | Fields | Meaning | Origin |
|---|---|---|---|
| `path` | `location: string`, `base: "declaring-file" \| "catalog-root" \| "absolute"` | Local directory | ACF, Claude, Codex, Copilot, Cursor, Pi, Gemini, Lume, Cline, OpenCode, Devin, Kiro |
| `github` | `repo: "owner/repo"`, `ref?`, `sha?`, `subdir?` | GitHub repository | ACF, Claude, Copilot, Devin, Codex (shorthand), VS Code, Kiro |
| `git` | `url`, `ref?`, `sha?`, `subdir?` | Any git remote | ACF, Claude (`url`, `git-subdir`), Codex, Copilot, Devin, Pi, Gemini, Goose, Cline |
| `npm` | `package`, `version?` (version/tag/range), `registry?` (https, no credentials) | npm package | Claude, Codex, Pi, OpenCode, Cline, VS Code |
| `archive` | `url` (https), `sha256?` | Downloadable tar/zip archive | Claude `archive`; Gemini release assets; Devin ZIP upload; MCPB |

Selector rules: `ref` is a floating branch/tag; `sha` is a full 40-hex commit. Both may be present ("track `ref`, currently pinned at `sha`"). ACF's existing `ref: <sha>` is normalized on read to `sha`. Sparse paths (`sparsePaths: string[]`) are allowed on `github`/`git` catalog sources (Claude, Codex).

### 2.4 Catalog

| Canonical field | Type | Meaning | Origin |
|---|---|---|---|
| `name` | PackageName grammar | Catalog identifier, half of the `name@catalog` key | Claude, Codex, Copilot, Cursor |
| `displayName` | string | Catalog label | Codex `interface.displayName` |
| `description` | string | Catalog summary | Claude, Copilot, Cursor |
| `version` | string | Catalog revision | Claude, Copilot, Cursor |
| `owner` | `Person` | Catalog owner | Claude, Copilot, Cursor |
| `pluginRoot` | relative path | Prefix for relative entry sources | Claude, Copilot, Cursor |
| `entries[]` | `CatalogEntry` | Listed packages | all |

`CatalogEntry`:

| Field | Type | Meaning | Origin |
|---|---|---|---|
| `name` | PackageName | Entry identity | all |
| `source` | `SourceDescriptor` | Where the package comes from | all |
| `listing` | subset of 2.1 metadata (`displayName, description, version, authors, homepage, repository, license, keywords, tags, category, icons, defaultEnabled`) | Entry-level metadata **as written in the catalog**; not merged into the package (see §4 C4) | Claude, Copilot, Cursor, Codex (`category`) |
| `installPolicy` | enum `available \| default \| required \| unavailable` | Whether consumers of this catalog get the package offered, installed by default, forced, or hidden | Codex `policy.installation` (`AVAILABLE`/`INSTALLED_BY_DEFAULT`/`NOT_AVAILABLE`), Cursor modes (`Default Off`/`Default On`/`Required`), Devin (`optionalPlugins`/`requiredPlugins`) |

Native ACF gets a catalog file only if this design is accepted: proposed `catalog.yml` at a repository root next to `acf/`, defaulting each `acf/**` capability to a `path` entry and allowing external `source` entries. Until then the catalog exists only in the model (read from foreign catalogs, written by catalog writers).

### 2.5 Consumer install state (`capabilities.yml` entry and lock)

| Canonical field | Type | Meaning | Origin |
|---|---|---|---|
| `source` | `SourceDescriptor` or catalog reference `{ catalog: string; name: PackageName; version?: SemVerRange }` | What to install | ACF + all installers |
| `scope` | enum `user \| project \| local` (implied by which file the entry is in) | Where the selection applies; `local` = this project, this machine, not shared | ACF (user, project); Claude, Copilot, Goose (`local`) |
| `enabled` | boolean, default = package `defaultEnabled` | Activation record | Claude/Copilot `enabledPlugins`, Codex `[plugins].enabled`, Goose, Gemini, Cline |
| `options` | `Record<OptionKey, value \| { env: string }>`; sensitive options accept only `{ env }` | Consumer option values | Claude `pluginConfigs`, Gemini `.env`, MCPB host config |
| `format` | `FormatId` (optional override) | Force a reader when a source is polyglot | new |
| existing `ref`, `path`, `capabilities`, `include`, `exclude`, `rename`, `only`, `except` | unchanged | | ACF |

`managed` (organization/enterprise policy) is a read-only fifth scope: caplet observes it (to report that a managed setting overrides or blocks a selection) and never writes it.

Canonical precedence: `managed` (observed) > `local` > `project` > `user`, applied per `(family, name)` exactly as §17.6 does today, extended with `local`.

Lock additions per entry: `sourceFormat`, `sha` (renamed concept of `resolvedSha`), `npmIntegrity` (for `npm`), `archiveSha256` (for `archive`), `dependencyOf` (for transitively resolved entries), and a hash that covers the executable bit (see §6).

### 2.6 Size of the core

- Package metadata: 21 fields (incl. 4 `links.*`), of which 9 already exist in ACF.
- Option definition: 11 fields with one 5-value enum.
- Dependency: 2 variants. Source descriptor: 5 kinds, 12 distinct leaf fields.
- Catalog: 7 fields; catalog entry: 4 fields plus the reused metadata subset; one 4-value enum.
- Install state: 3 new fields (`scope` value `local`, `enabled`, `options`) plus `format`.
- Provenance: 4 model-only fields.

Roughly 35 distinct concepts and about 70 leaf fields. Everything else in the inventories (about 120 further native keys) is per-target extra or format remainder.

---

## 3. Field-level support table

### 3.1 Targets with a plugin/extension package system

Columns: AP = Agent Plugins 1.0 format as written for any AP consumer; VS Code reads AP, Copilot legacy, Claude and `.plugin` formats; Cursor column assumes the `.cursor-plugin` writer (see §4 C12); Cline = its AP lane.

| Canonical | AP | Claude | Codex | Copilot CLI | VS Code | Cursor | Gemini | Devin | Goose | Kiro | Cline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `name` | N(name) | N(name) | N(name; public submission forbids `.` → D for publishing only) | N(name) | N(name) | N(name) | D(`.`→`-`, must equal dir; `acf.distribution.name-rewritten`) | N(name) | N(name) | N(name) | N(name) |
| `displayName` | D(drop) | N(displayName) | T(`extensions.com.openai.interface.displayName`) | D(drop) | D(drop) | D(drop) | D(drop) | N(displayName; semantics unverified) | D(drop) | D(drop) | D(drop) |
| `version` | N(version) | N(version; T: see §4 C7) | N(version) | N(version) | N(version) | N(version) | N(version, required; T: synthesized if absent) | N(version) | N(version) | N(version) | N(version) |
| `description` | N | N | N | N | N | N | N | N | D(not read by parser) | N | N |
| `longDescription` | D(drop) | D(drop) | T(`interface.longDescription`) | D | D | D | D | D | D | D | D |
| `authors[0]` | N(author) | N(author) | N(author; T `interface.developerName`←name) | N(author) | N(author) | N(author; `url` D) | U | N(author name/email) | U | N(author) | N(author) |
| `authors[1..]` | D(drop, `acf.distribution.authors-truncated`) | D | D | D | D | D | U | D | U | D | D |
| `homepage` | N | N | N(+T `interface.websiteURL` unless extra overrides) | N | N | N | U | N | U | N | N |
| `repository` | N(string; `type`/`directory` D) | N(string) | N(string) | N(string) | N(string) | N(string) | U | N(string) | U | N(string) | N(string) |
| `license` | N | N | N | N | N | N | U | N | U | N | N |
| `keywords` | N | N | N | N | N | N | U | N | U | N(also activation; info) | N |
| `tags` | D | T(catalog entry `tags`) | D | N(tags) | T(entry) | T(entry `tags`) | U | U | U | D | D |
| `category` | D | T(entry `category`) | N(`interface.category`; entry `category`) | N(legacy `category`; AP: D) | T(entry) | T(entry `category`) | U | U | U | D | D |
| `icons` | D | N(icon; primary only, theme variants D) | T(`interface.logo`/`logoDark` by theme) | D | D | N(logo; primary only) | U | N(logo) | U | D | D |
| `screenshots` | D | D | N(`interface.screenshots`) | D | D | D | U | D | U | D | D |
| `links.documentation` | D | N(documentationUrl) | D | D | D | D | U | D | U | D | D |
| `links.support` | D | N(supportUrl) | N(`interface.supportURL`) | D | D | D | U | D | U | D | D |
| `links.privacyPolicies` | D | N(privacyPolicyUrl; first only, rest D) | N(`interface.privacyPolicyURL`; first only) | D | D | D | U | D | U | D | D |
| `links.termsOfService` | D | N(termsOfServiceUrl) | N(`interface.termsOfServiceURL`) | D | D | D | U | D | U | D | D |
| `defaultEnabled` | U | N(defaultEnabled) | T(install: write `enabled=false`) | T(install: `enabledPlugins` false) | T(install: `chat.pluginLocations` false) | ? | T(install: enablement override `!`) | ? | T(install: `disabledPlugins`) | ? | T(install: `disabledAgentPlugins`) |
| `dependencies` by name | D(caplet installs deps itself; relation unenforced) | N(dependencies) | D | D | D | D | D | T(requiredPlugins, needs resolvable source) | D | D | D |
| `dependencies` by source | D(as above) | T(only when the dependency is emitted into the same caplet catalog; else D) | D | D | D | D | D | N(requiredPlugins) | D | D | D |
| `requires.hosts` | D(caplet checks host version at install when detectable) | D | D | D | D | D | D | D | D | D | D |
| `options` | D(see 3.3) | N(userConfig; `env` T via `CLAUDE_PLUGIN_OPTION_<KEY>`) | D | D | D | T(variables JSON Schema; `sensitive`, `file`/`directory` D; values admin-set) | T(settings[]: `name`←title, `envVar`←env, `sensitive`; other fields D) | D | D | D | D |
| package root placeholder | N(`${PLUGIN_ROOT}`, only in stdio `args`/`env` values/`cwd`) | N(`${CLAUDE_PLUGIN_ROOT}`) | N(`${PLUGIN_ROOT}`) | N(`${PLUGIN_ROOT}`) | N | N(`${CURSOR_PLUGIN_ROOT}`) | T(`${extensionPath}`) | ? | ? | N(`${PLUGIN_ROOT}`) | N |
| `${ACF_CAPABILITY_DATA}` | N(`${PLUGIN_DATA}`) | N(`${CLAUDE_PLUGIN_DATA}`) | N(`${PLUGIN_DATA}`) | N(`${PLUGIN_DATA}`) | ? | U(D: error if used) | U | ? | ? | N(`${PLUGIN_DATA}`) | ? |
| **Catalog** `name` | U | N(name) | N(name) | N(name) | N(reads Claude/Copilot) | N(name) | U | T(catalog plugin.json) | U | ? | U |
| catalog `displayName` | U | D | N(`interface.displayName`) | D | D | D | U | D | U | ? | U |
| catalog `description`/`version` | U | N(top-level and `metadata.*`) | D | N(`metadata.*`) | N | N(`metadata.*`) | U | D | U | ? | U |
| catalog `owner` | U | N(owner) | D | N(owner; `url` D) | N | N(owner; `url` D) | U | D | U | ? | U |
| catalog `pluginRoot` | U | N(`metadata.pluginRoot`) | T(prefix each `source.path`) | N | N | N | U | T(prefix) | U | ? | U |
| entry `installPolicy` | U | D(`required` → managed `enabledPlugins` is org-only; caplet never writes) | N(`policy.installation`; `required` D→`default`) | D | D | N(team mode, dashboard only → D for files) | U | T(`required`→`requiredPlugins`, `available`→`optionalPlugins`; `default` D) | U | ? | U |
| source `path` | N(directory load) | N(relative string) | N(`local`) | N(relative string) | N(`chat.pluginLocations`, `file:///`) | N(source path; `~/.cursor/plugins/local`) | N(local copy / `link`) | N(`--local`) | D(manual copy) | N(local dir) | N(`pluginPaths`) |
| source `github` | U | N(github) | T(url) | N(github) | N(owner/repo) | ?(team import) | T(git URL) | N(github) | T(git URL) | N | U |
| source `git` | U | N(url) | N(url) | N(url) | N | ? | N(git) | N(url) | N(git) | ? | U |
| source `subdir` | U | N(`git-subdir.path`) | N(`git-subdir.path`) | N(`github.path`) | ? | ? | U | N(path) | U | ? | U |
| source `ref` | U | N(ref) | N(ref) | N(ref) | ? | ? | N(`--ref`) | N(ref) | D(default branch only) | ? | U |
| source `sha` | U | N(sha) | N(sha) | N(sha, 40 hex) | ? | ? | T(`--ref <sha>`) | N(sha; drops `ref`) | D | ? | U |
| source `npm` | U | N(npm) | N(npm) | U | N(external npm, confirm on update) | U | U | U | U | U | U |
| source `archive` | U | N(archive) | U | U | U | U | T(GitHub release assets only) | T(web upload only) | U | U | U |
| catalog source `sparsePaths` | U | N(sparsePaths) | N(`sparse_paths`) | U | U | U | U | U | U | U | U |
| scope `user` | U | N(`--scope user`) | N(`~/.codex/config.toml` + `~/.agents/plugins/marketplace.json`) | N(`~/.copilot/settings.json`) | N(user settings) | N(UI user / `~/.cursor/plugins/local`) | N(install is user-level) | N(personal, cloud-synced) | N(`~/.agents/plugins`) | N(`~/.kiro/powers/installed`) | N(`~/.agents/plugins`) |
| scope `project` | U | N(`.claude/settings.json`) | N(trusted `.codex/config.toml` + `$REPO/.agents/plugins/marketplace.json`) | N(`.github/copilot/settings.json`) | D(only a recommendation via `enabledPlugins`) | ?(UI project scope; files unknown) → D(loose files) | D(user install + workspace enablement, which is private) | N(`.devin/config.json`) | N(`<project>/.agents/plugins`) | ? | U(D: error) |
| scope `local` | U | N(`.claude/settings.local.json`) | U(D: error) | N(`.github/copilot/settings.local.json`) | T(workspace enablement is per-machine) | U | T(workspace enablement override in central file) | T(`--local`) | N(`settings.local.json`) | U | U |
| activation record | U | N(`enabledPlugins["p@m"]`) | N(`[plugins."p@m"].enabled`) | N(`enabledPlugins`) | T(`chat.pluginLocations`) | ? | N(`extension-enablement.json`) | ? | N(`enabledPlugins`/`disabledPlugins` arrays) | ? | N(`disabledAgentPlugins`) |
| catalog registration | U | N(`extraKnownMarketplaces` via CLI) | N(`[marketplaces.<n>]` / file discovery) | N(`extraKnownMarketplaces`) | N(`chat.plugins.marketplaces`) | N(team marketplace, admin) | U | ? | U | ? | U |
| auto-update (caplet writes `false`) | U | N(`autoUpdate`) | ? | N(`autoUpdate`) | N(`extensions.autoUpdate`, global only → D) | N(team Auto Refresh, admin) | N(`autoUpdate` in install metadata) | N(floating ref vs sha) | N(`auto_update`) | ? | U |

### 3.2 Targets without a declarative plugin system (loose-file or code-package targets)

For these, the writer emits loose native files (as today) and package metadata has nowhere to go except the visible `ACF-MANAGED.md` inventory, which is explanatory only. A dropped field emits one `acf.distribution.field-unsupported` diagnostic per package, not per field, listing the fields.

| Canonical | OpenCode | Pi | Amp | Windsurf Cascade | Roo Code | Lume | Agent Skills standard |
|---|---|---|---|---|---|---|---|
| `name`, `version`, `description`, `license`, `homepage`, `repository`, `keywords`, `authors` | D(loose files; OpenCode `package.json` is for code plugins only) | T(optional Pi-package writer: npm `package.json` `name`, `version`, `description`, `author`+`contributors` (full list, no truncation), `license`, `homepage`, `repository` (object), `keywords` incl. `pi-package`); else D | D | D | D | D(Lume `extension.json` is for code extensions) | D(only skill frontmatter) |
| `displayName`, `longDescription`, `tags`, `category`, `icons`, `screenshots`, `links.*` | D | D(Pi gallery `pi.image`/`pi.video` are extras) | D | D | D | D | D |
| `defaultEnabled` | D | T(Pi package entry with empty resource filters when false) | D | D | D | D | U |
| `dependencies` | D(caplet-resolved) | D(caplet-resolved; Pi `bundledDependencies` is a different meaning) | D | D | D | D | U |
| `requires.hosts` | N(`engines.opencode`, only if a package.json is written) else D | D | D | D | D | D | U |
| `options` | D(substituted at emit) | D | D | D | D | D | U |
| scope `user` / `project` | N(`~/.config/opencode`, `.opencode`) | N(`~/.pi/agent`, `.pi`) | N(`~/.config/amp`, `.amp`) | N(loose files) | N(global storage / `.roo`) | N(user only; project D) | N(`~/.agents/skills`, `.agents/skills`) |
| scope `local` | U | U | U | U | U | U | U |
| sources / catalog / activation | U(caplet owns) | T(Pi package written to a caplet-owned dir and registered by local path in `settings.json packages[]`) | U | U | U | T(`settings.json extensions[]` path ref, code only) | U |

### 3.3 Degradation rules referenced above

| Situation | Rule | Diagnostic |
|---|---|---|
| Field has no native home | Drop; package still emitted | `acf.distribution.field-unsupported` (lossy) |
| `authors` longer than a single-author target allows | Emit `authors[0]`; drop rest | `acf.distribution.authors-truncated` (lossy) |
| `name` violates target grammar | Deterministic rewrite (`.`→`-`; truncate to limit + 6-char hash); record mapping in `.acf-managed.json` | `acf.distribution.name-rewritten` (warn) |
| Target requires `version` and package has none | `0.0.0-acf.<capabilityHash[0..12]>` | `acf.distribution.version-synthesized` (info) |
| Target needs a fresh version to refresh its cache (Claude non-in-place, Codex non-local) | Append SemVer build metadata `+acf.<hash12>` when content changed since the version was first locked | `acf.distribution.version-suffixed` (info) |
| `options` on a target without an option system | Caplet resolves values from the `capabilities.yml` entry at emit time and substitutes them; `sensitive` options must be supplied as `{ env }` and emitted as an env reference in the target's syntax; a `required` option without a value blocks emission | `acf.distribution.options-substituted` (lossy); `acf.distribution.option-missing` (error) |
| `options` with `sensitive: true` and the target would write the value into a shared file | Refuse | `acf.distribution.secret-in-shared-file` (error) |
| Dependency cannot be expressed natively | Caplet resolves and installs the dependency as its own locked entry; the relation is not enforced by the host | `acf.distribution.dependency-unenforced` (lossy) |
| Requested scope unsupported by target | Do not emit for that target at that scope | `acf.distribution.scope-unsupported` (error, matching §22.2's `null` scope rule but upgraded from `lossy` because writing to another scope changes who is affected) |
| `${ACF_CAPABILITY_DATA}` used on a target without a data dir | Refuse the facet that uses it | `acf.distribution.data-dir-unsupported` (error) |

---

## 4. Conflicts that must not be unioned

| # | Conflict | Evidence | Handling |
|---|---|---|---|
| C1 | **Same spelling, different meaning: `extensions`.** AP `extensions` is a map of client namespaces → opaque objects; Copilot legacy `extensions` is executable CLI extension paths (`string \| string[] \| {paths, exclusive}`). | copilot.md "Manifest fields"; agent-plugins.md §8 | Format detection decides (`$schema` present → AP). Never alias. Copilot legacy executable extensions become `targets.copilot.executableExtensions` (extra). |
| C2 | **Same spelling, different type/meaning: `enabledPlugins`.** Claude/Copilot: `map<"p@m", bool>` activation; VS Code: same map as a *recommendation*; Goose: `string[]` plus `disabledPlugins: string[]`. | claude-code.md, copilot.md, vscode.md, goose-kiro.md | Canonical `enabled` is consumer state; each installer backend owns its own native encoding. No shared writer helper keyed on the spelling. VS Code project scope is reported as degraded because a recommendation is not activation. |
| C3 | **Component path declarations: additive vs replace vs exclusive.** Claude `skills` adds, `commands`/`agents` replace, `hooks`/`mcpServers` merge (later MCP names win); Cursor all replace; Devin `skills` replaces (`[]` disables) and MCP inline map suppresses root file; Goose/Devin `exclusive` flag; AP forbids overrides; Devin `.mcp.json` beats `mcp.json`. | claude-code.md "Paths and merge semantics"; cursor.md; windsurf.md; goose-kiro.md | Not a core field. Each reader resolves declarations to an explicit list of component files using its own format's rule; writers place components at default locations, so no override is needed. The original declaration stays in the format remainder for same-format output. |
| C4 | **Catalog entry vs package manifest precedence.** Claude (strict): manifest `version` wins, entry `displayName` and `defaultEnabled` win, components additive except hooks replace by event; Cursor: manifest wins everything. | claude-code.md "Marketplace schema"; verified in live Claude docs; cursor.md | The model never merges entry listing into package metadata. `CatalogEntry.listing` and package metadata are stored separately; an *effective view* is computed only for display, using the source format's rule. Writers emit both sides as read. |
| C5 | **Manifest discovery order inversions in polyglot directories.** Copilot: AP root `plugin.json` (with `$schema`) beats legacy, then `.plugin/` → root → `.github/plugin/` → `.claude-plugin/`; Devin: `.devin-plugin` > `.claude-plugin` > root `plugin.json`; Goose: `.goose-plugin` > `.plugin` > root; VS Code accepts four formats. | copilot.md, windsurf.md, goose-kiro.md, vscode.md | Writers emit exactly one manifest per output directory, chosen per target. When a polyglot directory is explicitly requested (one directory shared by several tools), every manifest is generated from the same core and a consistency check rejects divergence. Readers that find several manifests read all, require core-field agreement (error otherwise), union components by file path, and honor the `format:` override in `capabilities.yml`. |
| C6 | **Scope precedence inversions.** Managed/org highest in Claude, Copilot, Devin; Amp workspace-hosted (org) lowest; Cline skills global > project; Cursor installed-from-marketplace beats local dev copy; Gemini docs disagree on system vs project. | amp.md, cline-roo.md, cursor.md, gemini-cli.md | Canonical choice: `local > project > user` per `(family, name)` (extends §17.6). Caplet resolves shadowing **before** emission and never installs the same package identity in two native scopes of one target, so native precedence is never consulted. Managed is observed only. |
| C7 | **What `version` does.** ACF: authored SemVer identity. Claude: cache key (same version may skip refresh). Codex: cache dir segment (`local` for local). Gemini: local copies compare manifest version, git compares remote hash, releases compare tag. AP: optional, "may inform" updates. Lume: must equal the module's definition version. | claude-code.md "Versions"; codex.md; gemini-cli.md; lume.md | Core keeps one meaning: the author's release identifier. Writers that use version as a cache key apply the `version-suffixed` rule (§3.3); caplet-owned local marketplaces load Claude plugins in place, which avoids most refresh hazards. |
| C8 | **Dependency resolution owner.** Claude resolves `dependencies` itself (transitive, cross-marketplace allowlist, semver tags); Devin auto-installs `requiredPlugins` recursively; ACF requires every fetched byte to be in `capabilities.lock`. | claude-code.md; windsurf.md; SPEC §19 | Canonical choice: caplet resolves dependencies transitively into the lock (each dependency becomes an entry with `dependencyOf`). Claude output contains `dependencies` only when each dependency is emitted into the same caplet-owned marketplace, so Claude's resolver lands on the locked copy. Otherwise the relation is degraded (`dependency-unenforced`) rather than letting the host fetch unpinned code. |
| C9 | **Auto-update vs lockfile.** Native auto-update (Claude, Copilot, Gemini, Goose, VS Code, Cursor team refresh) moves code without updating `capabilities.lock`. | §1.4 I7 | Caplet writes `autoUpdate: false` (or omits where default false) for every registration it owns. Updates happen only through `caplet update`. A foreign registration not owned by caplet is never edited. |
| C10 | **`ref` / `sha` semantics.** ACF `ref` may be a SHA and is required; Claude/Codex accept both; Devin forbids both; Copilot requires a full 40-hex `sha`; Goose has neither. | §1.3 S5-S6 | Canonical keeps both with defined meaning (§2.3). Writers: Devin gets `sha` only (diagnostic if `ref` dropped); Copilot gets the full `sha` from the lock; Goose cannot pin → caplet installs Goose output from its own locked snapshot instead of letting Goose clone. |
| C11 | **Relative path bases differ.** Claude: marketplace root or `pluginRoot`; Codex: marketplace **root**, not the catalog file's directory; Copilot: marketplace repo root; Pi: owning settings file; Lume: config dir; ACF: `capabilities.yml` dir. | §1.3 S1 | `SourceDescriptor.path` records `base`. Readers resolve to an absolute location plus the original base; writers re-relativize per target base. |
| C12 | **Plugin-root placeholder support.** Cursor does not expand `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` even in AP packages, and its own `${CURSOR_PLUGIN_ROOT}` violates the AP `cwd` pattern. AP forbids placeholders in `command`, HTTP URLs and headers. | cursor.md; agent-plugins.md | Cursor gets the `.cursor-plugin` format writer (with `${CURSOR_PLUGIN_ROOT}`), not the AP writer, whenever the package uses a package-root placeholder. Exact expansion sites are the MCP/hook facets' job. |
| C13 | **`keywords` with activation side effect.** Kiro uses AP `keywords` as power activation triggers; everyone else uses them for search. | goose-kiro.md | Core `keywords` keeps the discovery meaning. Kiro output emits them unchanged (same value is valid in both roles) and an `info` diagnostic notes the activation effect. Kiro-only activation keywords that should not be listed go in `targets.kiro.activationKeywords`. |
| C14 | **`defaultEnabled` vs install policy.** Claude `defaultEnabled:false` = installed but disabled; Codex `AVAILABLE` = not installed. | claude-code.md; codex.md | Two canonical fields (`defaultEnabled`, `installPolicy`). Never translate one into the other. |
| C15 | **Option value ownership.** Claude: user/managed `pluginConfigs` + secure storage; Gemini: extension `.env` (user) vs `<workspace>/.env` (shared file!) + keychain; Cursor: team admin dashboard; MCPB: host. | claude-code.md; gemini-cli.md; cursor.md | Package declares options; values are consumer state in `capabilities.yml` (`{ env }` for sensitive). Writers never place sensitive values in project files; Gemini workspace `.env` is used only for non-sensitive values at `local`-equivalent scope. |
| C16 | **Name grammar.** ACF slug forbids `.`; AP allows `.`; Gemini forbids `.` and ties name to dir; npm allows `@scope/`; Lume allows `_` and 128 chars. | §1.1 M1 | Core widens to the AP grammar (all AP names round-trip). npm scopes are kept as `source.package`, not `name`. Lume ids with `_` or >64 chars do not occur on the import path (Lume is not an import format). Narrower targets use `name-rewritten`. |
| C17 | **Hidden files are ignored by ACF but are manifests elsewhere.** SPEC §3.2 ignores dot-paths; `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `.github/plugin/`, `.mcp.json`, `.lsp.json`, `.goose-plugin-install.json` are semantic. | SPEC §3.2; tool inventories | Foreign readers define their own semantic file set; §3.2 applies only to `acf` format. Snapshots preserve hidden files of foreign packages. |
| C18 | **`command` sources execute code during install.** Claude-only, policy-controlled. | claude-code.md "Plugin source union" | Not core. Preserved as `targets.claude` catalog-entry extra. Caplet never runs it; it reports the entry as unresolvable unless the user explicitly opts in (out of scope for v1). |

---

## 5. Per-target extras

Extras live in `targets.<id>` at capability level (and at catalog/entry level once catalogs exist). Two key spaces are needed: **target ids** (tools) and **dialect ids** for vendor namespaces that several targets read (for example `com.github.copilot` is read by both Copilot and VS Code). Proposal: the registry declares, per target, the dialects it consumes; an extra keyed by a dialect is emitted to every target that consumes it.

Lossless round trip rules:

1. Reader: every native key is either projected to a core field, stored as an extra of the owning target/dialect, or stored verbatim in `remainder[formatId]`. Nothing is dropped on read.
2. Unchanged same-format package: the writer copies the snapshot bytes (manifest bytes, hidden files, executable bits) and does not reserialize.
3. Changed or cross-format package: the writer derives native fields from the core, then overlays extras, then remainder. One owner per output key: if an extra or remainder key collides with a key the writer derives from the core, emission fails with `acf.distribution.extra-overlaps-core`, except for keys a writer declares as *derived defaults* (for example Codex `interface.websiteURL` defaults to `homepage`, and a differing value read from a Codex package is stored as an extra that wins). Derived-default keys are listed per writer in the registry.
4. Extras for target X are dropped for every other target with one `acf.distribution.extra-dropped` (info) diagnostic per target.
5. Unknown AP extension namespaces are carried in `remainder["agent-plugins"].manifest.extensions` and the matching `<root>/<namespace>/` directory in `remainder.files`; they are re-emitted to every AP-format output (AP requires clients to ignore unknown namespaces, so this is safe), not only to one target.

| Target / dialect | Raw extras (stay native) |
|---|---|
| `claude` | Manifest: `$schema`, `metadata`, `settings` (only `agent`, `subagentStatusLine` honored), `channels`, `types`, `experimental.{themes,monitors,evals}`, legacy top-level `themes`/`monitors`, `lspServers`, `outputStyles`, `workflows`, inline component maps that cannot be lifted, `userConfig` keys beyond the core (none today). Catalog: `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`, `metadata` extra keys. Entry: `strict`, `relevance`, `headers`, `headersHelper`, `metadata`, component overrides. Sources: `command` kind; marketplace sources `url` (JSON catalog), `settings` (inline), `skipLfs`. |
| `codex` (dialect `com.openai`) | `extensions.com.openai` minus derived keys: `interface.{shortDescription, developerName (if differs), brandColor, brandColorDark, composerIcon, composerIconDark, defaultPrompt, capabilities, websiteURL (if differs)}`, `id`, `apps` + `.app.json`, `hooks` declaration, `onboardingSkill`, `review.*`, `publication.*`. Whole `.codex-plugin/plugin.json` compatibility overlay (replace-not-merge semantics preserved by keeping it whole). Catalog: `interface` extra keys, entry `policy.authentication`. Config: `[marketplaces.<n>]` extra keys. |
| `copilot` (dialect `com.github.copilot`, also consumed by `vscode`) | `extensions.com.github.copilot` and `com.github.copilot/` directory content not lifted into facets (`lsp.json`); legacy manifest `extensions` (executable paths, `exclusive`), legacy `lspServers`; entry `strict`. |
| `cursor` | `.cursor-plugin/plugin.json` `variables` keywords beyond the option core (`const`, nested `properties`, `items`), `rules`/component path declarations; entry `variables`; team distribution mode is dashboard state (not representable in files). |
| `gemini` | `contextFileName`, `excludeTools`, `themes`, `plan`, `migratedTo`, `policies/*.toml`; install metadata `releaseTag`, `allowPreRelease`; GitHub-release source form. |
| `kiro` (dialect `dev.kiro`) | `extensions["dev.kiro"]`, `dev.kiro/` directory, legacy `POWER.md` (frontmatter `displayName`, `author` string, `steering/`), `activationKeywords`. |
| `devin` | `optionalPlugins`, `forbiddenPlugins`, source `bundleId`, `bundleScope`, `account-upload`, dependency `env` secret references (`secret:org:NAME` …). |
| `goose` | `.goose-plugin/plugin.json` path selectors (`paths`, `exclusive`), install metadata `format`. |
| `pi` | `pi.{extensions,themes,video,image}`, `peerDependencies`, `bundledDependencies`, settings package filters (`autoload`, `+`/`-`/`!` patterns). |
| `opencode` | `package.json exports["./server"\|"./tui"]`, `oc-themes`, plugin tuple options. |
| `lume` | `hostContract`, `entrypoint`, extension settings `.jsonc`. |
| format `mcpb` (no target; read via Claude MCP bundles) | `_meta`, `compatibility.{platforms,runtimes}`, `localization`, `tools`/`prompts` declarations, `manifest_version`/`dxt_version` spelling. |

Required change: the current shared `capabilityExtension` schema (`pluginAuthor`, `appId`, `scope`, identical for all five targets) is replaced by the per-target schemas above. `pluginAuthor` is subsumed by `authors`; `appId` by `targets.codex.id`; `scope` is consumer state and does not belong in a package.

---

## 6. Delta versus current ACF SPEC and code

### 6.1 Exists and stays

- `acf.yml` fields `name`, `version`, `description`, `license`, `homepage`, `repository` (string), `keywords`, `only`, `except`, `targets` (SPEC §4.2; `Manifest` in `model.ts`).
- `capabilities.yml` source kinds `github:`, `git:`, `path:` with `ref`, `path`, `capabilities`, `include`, `exclude`, `rename`, `only`, `except` (SPEC §17.5; `capabilitiesYmlSchema`).
- `capabilities.lock` with `resolvedSha`, `capabilityHash`, `capabilityNames`, selectors (installer `LockEntry`).
- Scopes `user`/`project` with project-shadows-user (§17.6); emit scope selection (§17.7).
- Ownership sidecar `.acf-managed.json` with whole-file and JSON-pointer ownership (§22.7): sufficient to own `enabledPlugins["x@caplet"]`, `extraKnownMarketplaces.caplet`, `[plugins."x@caplet"]` regions in shared settings files.
- Bare-skill import (§20.3) and `synthesized` provenance.

### 6.2 Changes

| Area | Today | Change |
|---|---|---|
| SPEC §14.4, CONTEXT Axiom 12 | "Implementations MUST NOT read native artifacts as canonical ACF inputs" | Narrow to *caplet-emitted* artifacts. Foreign packages are read by format readers into the model with `sourceFormat` provenance. |
| SPEC §3.2 hidden files | Ignored | Applies to the `acf` format only; foreign readers define semantic files; snapshots keep hidden files. |
| `name` grammar (§4.2, §5) | Slug | Package name widens to the AP grammar for imported packages (≤64, dots allowed); slug becomes an authoring lint. Facet slugs unchanged. |
| `version` | Required SemVer | Required SemVer for authored `acf.yml`; optional arbitrary string on imported packages. |
| `authors` | `string[]` | `Person[]`, string form still accepted. |
| `repository` | string | `string \| {url, type?, directory?}`. |
| `targets.<t>` capability extension (`packages/core/src/targets/extensions.ts`) | One shared strict schema `{pluginAuthor, appId, scope}` for all targets | Per-target (and per-dialect) schemas listed in §5; `scope` removed. |
| `Scope` type (`model.ts`) | `"user" \| "project"` | Add `"local"`; add read-only `managed` for diagnostics. Location proposal: `./.agents/capabilities.local.yml` (gitignored) with snapshots under `./.agents/capabilities/` tagged by scope. |
| `SourceSpec` (`model.ts`, `sourceSpecSchema`) | `github` / `git` / `path` | Add `npm`, `archive`, `sha`, `subdir`, catalog reference. Keep `ref` required for git sources unless `sha` is given. |
| SPEC §17.5 `auth` | Documented, but `capabilitiesYmlSchema` is a strict object without `auth`, so a documented field is rejected | Fix the drift (either implement or remove); this is an existing bug, independent of this design. |
| SPEC §17.5 vs code `defaults.fetch.{shallow,blobless}` | Implemented, undocumented | Document. |
| Lock types | One schema in `packages/core/src/lock` (`capabilityHash, capabilityNames, resolvedSha, …`), re-exported by `packages/installer/src/lockfile.ts` and matching SPEC §19.3 | Add `sourceFormat`, `dependencyOf`, `npmIntegrity`, `archiveSha256`. |
| Hash (§19.5) | Excludes file mode; rejects symlinks | Include the executable bit (hooks and MCP launchers lose `+x` otherwise); keep rejecting symlinks but report them explicitly per file (AP allows in-root symlinks, so this is a declared loss). Needs `acf` hash version bump inside the lock. |
| §22.2 install paths, adapters | All five adapters emit loose files through `emitStandardAdapter` (`packages/adapters/src/common/emitter.ts`); no adapter writes `plugin.json`, a marketplace, or activation settings | Add plugin writers and install backends (6.3). Loose-file emission remains the path for targets without plugin systems and for scopes a plugin backend cannot serve. |
| Placeholders (`packages/adapters/src/common/placeholders.ts`) | `${ACF_CAPABILITY_DIR}` is replaced with an absolute path at emit | Plugin writers translate to the host's runtime placeholder instead (§2.1). |
| Registry (`packages/core/src/targets/registry.ts`) | Family-level `full/partial/none`, `installPaths`, `skillInstallPaths`, `mcpInstallPath` | Add per-target `distribution` declaration: package formats written, dialects consumed, scopes supported per backend, activation encoding, catalog support, derived-default keys, and the field support rows of §3 (one table, docs and diagnostics derived from it). |
| Installer `inspectSource` (`packages/installer/src/inventory.ts`) | `acf.yml` → `acf/` → bare skills | Detection order: `acf.yml` → `acf/` → AP root `plugin.json` with `$schema` → `.claude-plugin/plugin.json` → other plugin manifests → catalogs (`.claude-plugin/marketplace.json`, `.github/plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `.cursor-plugin/marketplace.json`) → bare skills. A recognized-but-invalid manifest is an error, never a fallthrough. A foreign plugin is one capability, not one per skill. |
| Target ids | `claude, codex, cursor, opencode, pi` | Add at least `copilot`, `vscode`; later `gemini`, `devin`, `goose`, `kiro`, `cline`, `amp`, `lume` as writers appear. |

### 6.3 New

- **Package metadata fields:** `displayName`, `longDescription`, `tags`, `category`, `icons`, `screenshots`, `links.*`, `defaultEnabled`, `dependencies`, `requires.hosts`, `options`.
- **Model types:** `Person`, `OptionDef`, `Dependency`, `SourceDescriptor`, `Catalog`, `CatalogEntry`, `InstallEntry`, `FormatId`, provenance (`sourceFormat`, `manifests`, `remainder`, `snapshot`).
- **Readers:** Agent Plugins, Claude plugin, Claude/Copilot/Cursor/Codex catalogs (first slice: AP + Claude plugin + Claude marketplace).
- **Writers:** one shared AP package writer (Codex, Copilot, VS Code, Kiro, Cline, and Cursor when no plugin-root placeholder is used); Claude plugin + Claude marketplace writer; Codex catalog writer (`.agents/plugins/marketplace.json`); Cursor `.cursor-plugin` writer; optional Pi package writer.
- **Install backends (CLI host, not pure writers):**
  - Claude: caplet-owned local marketplace directory per scope; `claude plugin marketplace add <dir> --scope <s>` and `claude plugin install <p>@<m> --scope <s>`; verify with `claude plugin list --json`. Files Claude then owns: `~/.claude/plugins/known_marketplaces.json`, `installed_plugins.json`, settings `extraKnownMarketplaces`, `enabledPlugins`. Relative-path plugins in local marketplaces load in place.
  - Copilot CLI: local directory-source marketplace (documented live-loading exception) registered via `extraKnownMarketplaces` + `enabledPlugins` in `~/.copilot/settings.json` / `.github/copilot/settings.json` / `.github/copilot/settings.local.json`, or `copilot plugin install`.
  - VS Code: user-level `chat.pluginLocations {<dir>: true}`; it also auto-discovers Copilot CLI installs under `~/.copilot/installed-plugins/`.
  - Codex: AP package + catalog at `~/.agents/plugins/marketplace.json` (user) or `$REPO/.agents/plugins/marketplace.json` (project) + `[plugins."p@m"] enabled = true` in `config.toml`. Whether this installs without the desktop UI is unverified (§7).
  - Shared root: `~/.agents/plugins/<name>/` is the Goose user discovery root and the Cline AP root, and its sibling `marketplace.json` is Codex's personal catalog. One AP package directory there can serve all three, analogous to `~/.agents/skills/`.
- **Status model:** generated package current/drifted; native registration present/missing/disabled; activation pending reload/trust/options (advisor §5).
- **Diagnostics namespace:** `acf.distribution.*` (codes in §3.3 and §5).

---

## 7. Open questions and unverified claims

1. **Claude version skew.** Live docs describe `displayName`, `defaultEnabled`, `dependencies`, `archive`/`command` sources, `channels`, `workflows`; the installed Claude is 2.1.97 and the claude-code inventory notes v2.1.287 availability is unknown. Which fields does the minimum supported Claude accept? A manifest field Claude does not know is stripped (unknown top-level keys) or fatal (inside strict nested objects).
2. **Codex install path without desktop.** Documented CLI manages catalogs only; whether `[plugins."p@m"] enabled = true` plus a catalog causes installation into `~/.codex/plugins/cache/<m>/<p>/local/` on CLI start is unverified ("disabled configured plugins can still be installed/refreshed during marketplace refresh" hints yes).
3. **Cursor project scope and disk state.** Install files, enable keys and cache are UNKNOWN; only `~/.cursor/plugins/local/<plugin>/` is documented (user, dev use). Project-scope Cursor plugins need runtime verification; until then project scope for Cursor stays loose files.
4. **Copilot `url` source property spelling** and complete `extraKnownMarketplaces.source` object are UNKNOWN.
5. **Placeholder spelling** for options (`${ACF_OPTION:key}`) and data dir (`${ACF_CAPABILITY_DATA}`), need agreement with the MCP and hook facets.
6. **`local` scope location** for ACF (`.agents/capabilities.local.yml` proposal) and how snapshots of `local` and `project` entries coexist under `.agents/capabilities/`.
7. **Caplet marketplace naming.** Claude records marketplaces in user-level `known_marketplaces.json` even for project-scope registration; two projects registering a marketplace named `caplet` may collide. Candidate: `caplet-<scope>-<short hash of root>`; needs a runtime check.
8. **Version suffixing.** Does Claude compare version strings exactly (so `+acf.<hash>` forces refresh)? SemVer ignores build metadata for precedence, which could interact with dependency `version` ranges.
9. **Native ACF catalog file** (`catalog.yml`) is a proposal; the user has not decided whether native ACF should author catalogs or only read/write foreign ones.
10. **Agent Plugins 1.1.0** is a working draft that Copilot already recognizes; its manifest changes were not researched.
11. **Kiro required fields**: Kiro's create guide calls `version`, `description`, `author`, `keywords` required, contradicting the AP schema. Writers should emit all four for Kiro when available; behavior when absent is unknown.
12. **Devin `displayName`/`logo`** are observed in official source but not in the formal reference.
13. **Goose and AP root `plugin.json`**: Goose parses root `plugin.json` as Open Plugins (reads `.mcp.json`, not `mcp.json`), so an AP package in `~/.agents/plugins/` gives Goose skills but not MCP. Whether to add `.mcp.json` to shared packages (Devin then prefers `.mcp.json` over `mcp.json`) is undecided.
14. **Gemini `description`** is documented but missing from the source `ExtensionConfig` interface; Gemini may ignore it.
15. **MCPB as an import format.** Claude plugins can reference `.mcpb` bundles; the MCPB-derived core fields (`longDescription`, `screenshots`, `links.*`, `options`) assume caplet will read MCPB. If it will not, `longDescription` and `screenshots` rest on Codex alone and should move to `targets.codex`.
16. **Code-package hosts** (OpenCode, Pi, Amp, Cline code lane, Lume): their native packages are executable modules. Importing them into the canonical model is out of scope; only their declarative resources (skills, prompts) are importable. Single-file URL sources (Cline, Amp) have no core representation.
17. **Amp, Windsurf Cascade, Roo**: no declarative package or activation contract was found; marked loose-file targets.
