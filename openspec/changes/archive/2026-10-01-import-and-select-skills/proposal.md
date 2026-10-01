## Why

Caplet can declaratively manage capabilities once a source adopts ACF, but most public agent skills are distributed as bare `SKILL.md` directories and are therefore unavailable. Multi-item sources also install everything by default, forcing users to edit YAML after `add`; importing the ecosystem needs an explicit and interactive selection path that is safe before manifest mutation.

## What Changes

- Import repositories without `acf.yml` when they contain recognizable skill directories, synthesizing one ordinary capability per discovered skill while preserving source provenance in the lockfile.
- Discover bare skills at a root `SKILL.md`, under `skills/<name>/SKILL.md`, or in one-level-deep `<name>/SKILL.md` directories, with deterministic precedence, collision handling, and invalid-layout diagnostics.
- Include the complete portable contents of each imported skill directory by default, excluding generated/managed and dependency-tree paths.
- Add `github:owner/repo@<capability>` shorthand to `caplet add`, translating it into the existing `capabilities:` selector namespace for manifested and synthesized sources alike.
- Prompt with a dependency-free numbered multi-select before changing the manifest when an unqualified interactive source exposes multiple capabilities; preserve deterministic install-all behavior for non-interactive and `--yes` runs.
- Make removal selector-aware so removing one capability from a shared source retains selected siblings.
- Surface synthesized provenance through lockfiles, `show`, JSON output, plans, and diagnostics without changing manifested ACF source behavior.

## Capabilities

### New Capabilities

- `unmanifested-skill-import`: Discovery, per-skill capability synthesis, implicit asset inclusion, provenance, and reconciliation for repositories containing skills but no ACF manifest.
- `source-item-selection`: Explicit GitHub source suffix selection and pre-mutation interactive capability selection across manifested and synthesized sources.

### Modified Capabilities

None.

## Impact

Affected areas include core source discovery and imported-skill reading, installer inventory/materialization and lock metadata, Caplet `add`/`remove` manifest mutation, terminal prompting, help/completions/JSON/show output, reconciliation tests, and user documentation. No new runtime dependency is intended; existing manifested sources and non-TTY automation remain compatible.
