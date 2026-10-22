## Why

Caplet installs only native ACF capabilities and bare skills, and it writes loose files even where a host has a real plugin system, so most published agent packages (Agent Plugins 1.0 and Claude plugins) are unavailable and Claude output cannot be enabled, disabled or updated as one unit. The plugin-interop research (`research/plugin-interop/`) documents every target's package contract field by field, and five advisor reviews (`research/plugin-interop/advice.md`) agree on the boundary for a first slice: preserve foreign packages losslessly, translate skills and basic MCP, emit real plugins, and refuse rather than weaken restrictions. This change is the smallest slice that delivers that end to end for Claude: install a published Claude plugin or Agent Plugins package from a source and get a real Claude plugin, while existing Claude installs move to the plugin safely.

## What Changes

- Define ACF's **two-layer model** normatively: a portable core whose fields are the union of meanings shared by at least two tools with proved equivalence, plus per-target raw extras emitted verbatim to the matching tool and dropped with a diagnostic elsewhere. Native ACF can author everything a supported foreign package carries (core field, inline extra or `native/<target>/` file), so it stays the most capable format; meanings whose core contract is deferred travel as per-target extras until promoted.
- Replace family-level `full`/`partial` claims with a field-level support table per target and carrier for the skill and MCP fields of this slice; every field carries a safety class that decides whether a writer may degrade it, and every refusing cell of a data-only restriction has a negative fixture.
- Add **source format readers** for Agent Plugins 1.0 packages and Claude plugins (skills and MCP projected, everything else preserved) beside the existing ACF and bare-skill paths, with deterministic format detection, an explicit `format:` override, one capability per package, and an immutable source snapshot.
- Define **lossless same-format output** for Claude plugins and the rules for transformed packages.
- Extend the **canonical schemas** with the fields the readers need (skill `license`, `compatibility`, `metadata`, `argument-hint`; MCP `cwd` with the Agent Plugins default made explicit, `${ACF_DATA_DIR}`, per-target package values such as a non-SemVer Claude `version`, legacy `authors` strings kept valid), fix the meaning of `invocation.user: false` to an invocation prohibition, keep path-scoped activation out of the core, and serialize skills and MCP natively for Claude, Codex, Cursor, OpenCode and Pi.
- Add a **Claude plugin carrier**: a caplet-owned local marketplace per scope driven through the `claude plugin` CLI, ACF user mapped to Claude user and ACF project to Claude local scope (per machine, so no absolute path is committed), host state reported separately from file state, native disables respected.
- **BREAKING (output layout)**: Claude skills and MCP servers move from loose `.claude/` files into the generated plugin, so their invocation names become plugin-qualified (`/<capability>:<skill>`), announced once. An ownership-aware migration retires only caplet-owned, undrifted loose artifacts after the plugin is registered. Native ACF capabilities with agents, commands, hooks or instructions for Claude stay on loose output.
- **BREAKING (emission)**: a writer that cannot carry a restricting skill or MCP field refuses that component for that target instead of degrading it with a `lossy` warning.
- Harden installation integrity: a mode-aware payload digest beside the unchanged v1 `capabilityHash`, per-capability lock provenance, verification before emission, frozen restores from the locked revision, ownership-safe apply, output containment, credential-free source URLs, and an informational report of executable additions and changes (never a prompt or gate: adding or updating a source is the consumer's approval).
- Known defect recorded, not fixed here: loose Claude hook output is not in Claude's settings shape and maps `permission_request` to `PreToolUse`; fixed by the follow-up change `claude-loose-hooks-repair`.
- Follow-up changes, each its own directory: `agent-plugins-output` (Agent Plugins writers, Codex first then Copilot), `acf-root-agent-plugins-package` (native ACF root as an Agent Plugins package), `canonical-skill-mcp-extensions` (display names, MCP enablement, tool filters, timeouts, path-scope promotion gate), `claude-loose-hooks-repair`. Further follow-ups without a directory yet are listed in design.md.

## Capabilities

### New Capabilities

- `capability-model-layers`: Two-layer model, union-without-sacrifice promotion rule, pending meanings as extras, native ACF expressiveness parity, safety classes, field-level support table, negative fixtures for data-only restrictions, and extras composition rules (amends SPEC.md §7, §14.3, §22.1).
- `source-format-readers`: Format detection and precedence, Agent Plugins 1.0 and Claude plugin readers, preserved source snapshots, and the lossless round-trip contract (amends SPEC.md §14.4, §20).
- `canonical-package-metadata`: Union package metadata and its mapping to and from native plugin manifests (amends SPEC.md §4.2).
- `canonical-skills`: Skill core fields of this slice, pending skill meanings, and per-target skill support (amends SPEC.md §9, §22.2).
- `canonical-mcp`: MCP core fields of this slice, placeholder mapping, pending MCP meanings, and per-target MCP support (amends SPEC.md §13a, §22.5).
- `claude-plugin-output`: Claude carrier selection, plugin writer, marketplace registration, scope mapping, host state, and migration from loose Claude output including the one-time rename notice (amends SPEC.md §14.7, §22.2, §22.5).
- `install-integrity`: Payload digest, lock provenance, verification, frozen restore, ownership-safe apply, containment, credential-free sources, and the executable change report (amends SPEC.md §18, §19).

### Modified Capabilities

None. `openspec/specs/` holds no capability specs yet; root `SPEC.md` remains the normative format specification, and each new capability above names the SPEC.md sections its requirements amend.

## Impact

- **Core** (`packages/core`): `AcfCapability` gains source provenance, a snapshot reference and native remainders; one lock schema replaces the competing core and installer definitions; a new digest module; the target registry becomes a field-level support table with safety classes for skills and MCP; reader dispatch by format.
- **Installer** (`packages/installer`): `inspectSource` detects formats; materialization preserves hidden files and modes and rejects links; lock entries record format and per-capability digests; frozen restores use `resolvedSha`.
- **Adapters** (`packages/adapters`): native serializers replace canonical frontmatter passthrough for skills and MCP; a Claude plugin writer; loose writers refuse restricting fields they cannot carry.
- **Caplet** (`apps/caplet`): `targets.claude.carrier`, a Claude host port, plan and status output for host state, refusals and executable changes, sidecar entries with target, carrier and mode, apply-time preconditions, and the Claude migration.
- **Docs**: SPEC.md §§4.2, 7, 9, 13a, 14.3, 14.4, 14.7, 18, 19, 20, 22.1, 22.2, 22.5; CONTEXT.md Axioms 4 and 12; IMPLEMENTATION.md §§3, 4, 7, 8.2; README.
- **Users**: existing Claude installs migrate on the next apply and Claude skills become plugin-qualified; packages whose restrictions a target cannot honor now fail for that target with an actionable diagnostic; the `claude` CLI becomes a runtime dependency for registering Claude plugins (without it, caplet generates the plugin and reports registration as required).
