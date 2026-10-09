## Purpose

Defines the installation integrity guarantees that foreign packages require: a mode-aware payload digest, per-capability lock provenance, verification before emission, frozen restores, ownership-safe apply, output containment, credential-free sources and a visible report of executable changes. Amends SPEC.md §18, §19 and §22.7.

## ADDED Requirements

### Requirement: Payload digest
Caplet SHALL compute a payload digest `acf-tree-2:sha256:<hex>` over a capability's materialized snapshot: entries sorted by NFC relative path bytes, each framed as the entry kind, the path length and bytes, the executable bit, and the content length and bytes, all lengths as unsigned 64-bit big-endian integers. The v1 `capabilityHash` of SPEC.md §19.5 SHALL remain unchanged and continue to be written.

#### Scenario: Mode change changes the digest
- **WHEN** only the executable bit of `scripts/run.sh` changes
- **THEN** the payload digest changes and the v1 `capabilityHash` does not

#### Scenario: Ambiguous v1 encodings differ in v2
- **WHEN** two snapshots whose v1 concatenations are byte-identical differ in where one path ends and its content begins
- **THEN** their payload digests differ

### Requirement: One lock schema with per-capability provenance
The core and installer lock definitions SHALL be unified into one schema. Each lock entry SHALL additionally record, per capability: `name`, `format` (`acf`, `agent-plugins`, `claude-plugin`, `skills`), `formatVersion` where the format has one, the selected source path, and `payloadDigest`. The new fields are additive under `acf: 1`; readers SHALL accept lockfiles without them and write them on the next resolution. An entry's requested `format` SHALL be recorded apart from the detected per-capability `format`, so a changed or removed `format`, like a changed `rename`, is `acf.lock.drift`.

#### Scenario: Multi-capability source
- **WHEN** a source provides two capabilities
- **THEN** the lock records a distinct `payloadDigest` for each, not the first capability's hash for both

#### Scenario: Changed resolution intent under a frozen install
- **WHEN** an entry's `rename` or `format` changes, or its `format` is removed, and a frozen or offline install runs
- **THEN** it fails with `acf.lock.drift` and changes neither the lock nor the installed snapshots

### Requirement: Verify before emission and frozen restore
Before emitting from a lock, caplet SHALL recompute each capability's payload digest from the snapshot and SHALL fail with `acf.lock.digest-mismatch` when it differs from the lock. A frozen or locked restore SHALL fetch the recorded `resolvedSha`, not the moving `ref`. An installed capability SHALL count as present only when its digest verifies, not merely when its directory exists.

#### Scenario: Tampered cache
- **WHEN** a cached snapshot file is modified after locking and apply runs
- **THEN** apply fails with `acf.lock.digest-mismatch` naming the capability and writes nothing for it

#### Scenario: Branch moved upstream
- **WHEN** the locked `ref` is `main`, upstream `main` has moved, and a frozen install runs
- **THEN** caplet installs the content at the locked `resolvedSha`

### Requirement: Credential-free sources
Source URLs containing userinfo, and query parameters or fragments that look like credentials, SHALL be rejected when added or resolved, and SHALL never be written to `capabilities.yml`, the lockfile, sidecars or diagnostics. Authentication SHALL use the configured auth mechanism (SPEC.md §18).

#### Scenario: Token in a git URL
- **WHEN** a user runs `caplet add git:https://x-access-token:abc@github.com/o/r`
- **THEN** the command fails, the message redacts the credential, and no file contains it

### Requirement: Ownership-safe apply
Sidecar entries SHALL record `target`, `carrier`, `capability`, `facet`, `path`, `owns` and the file mode in addition to `hash`. Each planned delete or modification SHALL carry the expected current hash, and apply SHALL skip a change whose target content no longer matches with a drift warning instead of overwriting or deleting it. Stale-entry sweeping SHALL remove entries whose path is no longer desired even when the capability and facet still exist.

#### Scenario: File edited between plan and apply
- **WHEN** a user edits an owned file after the plan is computed and before apply writes it
- **THEN** apply leaves the file unchanged and reports drift

#### Scenario: Renamed skill leaves no orphan
- **WHEN** a capability renames a skill and apply runs
- **THEN** the old skill directory is deleted and its sidecar entries are removed

### Requirement: Output containment
Every write and delete SHALL resolve, after following existing parent directories and an existing symbolic link at the path itself, to a location inside the declared output root of its target and scope; this includes the root's sidecar and `ACF-MANAGED.md`. A path escaping its root, or a parent directory or file that is a symbolic link leaving the root or dangling, SHALL fail apply for that target with an error naming the path. The exception is an existing symbolic link at a host file caplet only merges owned regions into (for example `settings.json`, `CLAUDE.md`, `.mcp.json`, `config.toml`): that file belongs to the user, so caplet SHALL write and remove its regions through the link wherever it points; the file's parent directories are checked as before.

#### Scenario: Symlinked output directory
- **WHEN** `.claude/skills` is a symbolic link to `/etc`
- **THEN** apply fails for Claude without writing through the link

#### Scenario: Symlinked owned file
- **WHEN** an owned `SKILL.md` or the root's `.acf-managed.json` is a symbolic link to a file outside the root
- **THEN** apply fails for that root without writing through the link

#### Scenario: Merged host file linked into dotfiles
- **WHEN** the project `.mcp.json` caplet merges servers into is a symbolic link to a file in a dotfiles checkout
- **THEN** apply and remove update the server entries in the linked file and leave the link in place

### Requirement: Executable change report
The consumer's explicit act of adding a source or updating it, which pins the resolved revision and payload digest in `capabilities.lock`, SHALL be the approval of that content; caplet SHALL NOT add its own acceptance prompt, acceptance store or activation gate for executable components. `caplet add`, `caplet update` and `caplet apply` (human and `--json` output, including `--dry-run`) SHALL list, per capability and target, every executable component added, changed or removed relative to the previously locked or installed content: MCP stdio commands, hooks, LSP servers, monitors, files with the executable bit, Claude `bin/` entries and other code modules the registry classifies as executing code. The list SHALL be shown whenever it is non-empty, including in non-interactive runs, and SHALL NOT prompt or block. Caplet SHALL NOT pre-approve tools, permissions or MCP servers in any host, and SHALL NOT write or bypass a host's own trust, approval or enterprise-policy state.

#### Scenario: New server in an update
- **WHEN** an update adds a stdio MCP server to an installed Claude plugin and apply runs non-interactively
- **THEN** apply installs the update, and its output lists the new server's command under executable changes for Claude

#### Scenario: Native executable configuration
- **WHEN** an update changes `native/claude/hooks/hooks.json` or `targets.claude.native.lspServers` of a native ACF capability installed as a Claude plugin
- **THEN** the output lists the changed hook or LSP server component for Claude, as it would for the same change in a foreign Claude plugin

#### Scenario: Unchanged executables
- **WHEN** apply runs with no executable component added, changed or removed
- **THEN** the output contains no executable-change section

#### Scenario: Host trust prompt stays with the host
- **WHEN** a project-scope Claude plugin with an MCP server is installed
- **THEN** caplet writes no Claude MCP approval settings, and Claude's own approval prompt still applies
