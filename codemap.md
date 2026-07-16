# Repository Atlas: agent-capability-format

## Project Responsibility
Agent Capability Format (ACF) is a TypeScript/Bun monorepo for declaring portable agent capabilities, resolving them across user/project scopes, and emitting native artifacts for Claude Code, Codex, Cursor, OpenCode, and Pi. `caplet` is the reference CLI; reusable behavior lives in workspace packages.

## System Design and Data Flow
1. Core readers parse manifests and facet files into the canonical model, validate them, and collect diagnostics.
2. The installer resolves path/Git declarations from `capabilities.yml`, inventories manifested or bare-skill sources, selects exact or globbed capability candidates, safely reconciles scope snapshots, and records selector intent, synthesized provenance, and content hashes in deterministic lockfiles.
3. Core scope resolution and applicability select effective capabilities and facets for a target.
4. Registered adapters translate the selected model into `FileDiff` plans, including per-skill `ACF-MANAGED.md` artifact notices and root-level inventory notices.
5. Caplet applies those plans while maintaining `.acf-managed.json` ownership and drift metadata, generating root inventory notices that catalog all managed artifacts by capability.
6. SDK callers can query typed facet views directly.

## Root Entry Points and Configuration
- `package.json`: Bun workspace manifest and root build, type-check, test, lint, CI, and Caplet scripts.
- `turbo.json`: dependency-aware workspace task graph.
- `tsconfig.json` / `tsconfig.base.json`: shared strict TypeScript project configuration.
- `biome.json`: repository formatting and lint policy.
- `apps/caplet/src/bin.ts`: executable CLI entry point.
- `packages/core/src/index.ts`, `packages/installer/src/index.ts`, `packages/adapters/src/index.ts`, and `packages/sdk/src/index.ts`: library entry points.

## Integration Points
- ACF source directories and `.agents/capabilities.yml` are external inputs.
- Native host install roots and `.acf-managed.json` sidecars are filesystem outputs.
- `ACF-MANAGED.md` files serve as both per-skill artifact notices and root-level inventory manifests.
- `@acf/runtime-taxonomy` supplies shared runtime names; `@acf/core` is the model hub; installer, adapters, SDK, and Caplet build on it.

## Repository Directory Map

| Directory | Responsibility | Detailed map |
| --- | --- | --- |
| `apps/caplet/` | Packages the `caplet` command-line application and its public programmatic exports. | [Map](apps/caplet/codemap.md) |
| `apps/caplet/src/apply/` | Applies adapter-generated file diffs and maintains ownership metadata for safe updates and removal. | [Map](apps/caplet/src/apply/codemap.md) |
| `apps/caplet/src/` | Composes the Caplet CLI, command handlers, filesystem application logic, and public exports. | [Map](apps/caplet/src/codemap.md) |
| `apps/caplet/src/commands/` | Defines the user-facing Caplet handlers for initialization, add/remove/update, apply, list/show/status/check/doctor, and shell completion. | [Map](apps/caplet/src/commands/codemap.md) |
| `apps/caplet/src/internal/` | Provides shared CLI infrastructure for argument normalization, scope discovery, manifests, reporting, filesystem access, and end-to-end workflows. | [Map](apps/caplet/src/internal/codemap.md) |
| `apps/` | Holds runnable end-user applications. The current application is the `caplet` reference CLI. | [Map](apps/codemap.md) |
| `packages/adapters/` | Packages `@acf/adapters`, the host-specific emitters that translate canonical capabilities into native file diffs. | [Map](packages/adapters/codemap.md) |
| `packages/adapters/src/claude/` | Implements and registers the Claude Code target adapter. | [Map](packages/adapters/src/claude/codemap.md) |
| `packages/adapters/src/` | Registers and exports the supported Claude, Codex, Cursor, OpenCode, and Pi target adapters. | [Map](packages/adapters/src/codemap.md) |
| `packages/adapters/src/codex/` | Implements and registers the Codex target adapter. | [Map](packages/adapters/src/codex/codemap.md) |
| `packages/adapters/src/common/` | Implements shared transformations used by all target adapters. | [Map](packages/adapters/src/common/codemap.md) |
| `packages/adapters/src/cursor/` | Implements and registers the Cursor target adapter. | [Map](packages/adapters/src/cursor/codemap.md) |
| `packages/adapters/src/opencode/` | Implements and registers the OpenCode target adapter. | [Map](packages/adapters/src/opencode/codemap.md) |
| `packages/adapters/src/pi/` | Implements and registers the Pi target adapter. | [Map](packages/adapters/src/pi/codemap.md) |
| `packages/` | Contains the reusable ACF libraries: canonical model/core processing, target adapters, source installation, consumer SDK, and runtime taxonomy. | [Map](packages/codemap.md) |
| `packages/core/` | Packages `@acf/core`, the canonical domain model and processing pipeline for ACF capabilities. | [Map](packages/core/codemap.md) |
| `packages/core/src/applicability/` | Computes and validates which registered targets a capability or facet applies to. | [Map](packages/core/src/applicability/codemap.md) |
| `packages/core/src/assets/` | Resolves declared assets and recursively collects portable implicit assets for synthesized skill imports. | [Map](packages/core/src/assets/codemap.md) |
| `packages/core/src/caplet-config/` | Discovers, parses, validates, and merges user and project Caplet configuration. | [Map](packages/core/src/caplet-config/codemap.md) |
| `packages/core/src/` | Implements the public `@acf/core` API. | [Map](packages/core/src/codemap.md) |
| `packages/core/src/diagnostics/` | Defines the stable ACF diagnostic code catalog and constructors. | [Map](packages/core/src/diagnostics/codemap.md) |
| `packages/core/src/emit/` | Orchestrates target-specific emission for resolved capabilities. | [Map](packages/core/src/emit/codemap.md) |
| `packages/core/src/hash/` | Computes deterministic content hashes for capability directory trees. | [Map](packages/core/src/hash/codemap.md) |
| `packages/core/src/reader/` | Reads an ACF capability directory into the canonical in-memory model and diagnostics. | [Map](packages/core/src/reader/codemap.md) |
| `packages/core/src/resolver/` | Discovers capability repositories and resolves user/project scope trees into effective capabilities. | [Map](packages/core/src/resolver/codemap.md) |
| `packages/core/src/schemas/` | Defines runtime Zod schemas for ACF manifests, facets, hooks, MCP servers, source manifests, lockfiles, and Caplet config. | [Map](packages/core/src/schemas/codemap.md) |
| `packages/core/src/targets/` | Defines supported host targets, their install layouts and support matrices, extension schemas, and adapter registration. | [Map](packages/core/src/targets/codemap.md) |
| `packages/core/src/types/` | Defines the canonical TypeScript contracts for ACF source models, diagnostics, scope resolution, targets, emission, file diffs, and ownership sidecars. | [Map](packages/core/src/types/codemap.md) |
| `packages/core/src/utils/` | Provides small asynchronous filesystem primitives used by core processing. | [Map](packages/core/src/utils/codemap.md) |
| `packages/core/src/validator/` | Provides the validator compatibility entry point. | [Map](packages/core/src/validator/codemap.md) |
| `packages/installer/` | Packages `@acf/installer`, which resolves capability source declarations into local capability trees and lockfiles. | [Map](packages/installer/codemap.md) |
| `packages/installer/src/` | Implements source acquisition, manifested/bare-skill inventory, selection, staged installation, reconciliation, and locking. | [Map](packages/installer/src/codemap.md) |
| `packages/runtime-taxonomy/` | Packages the provisional canonical runtime operation, hook-type, and trigger-name vocabulary. | [Map](packages/runtime-taxonomy/codemap.md) |
| `packages/runtime-taxonomy/src/` | Defines canonical string-literal sets and type guards for runtime operations, hook types, and trigger names. | [Map](packages/runtime-taxonomy/src/codemap.md) |
| `packages/sdk/` | Packages `@acf/sdk`, the high-level consumer API for loading resolved, target-applicable capability facets. | [Map](packages/sdk/codemap.md) |
| `packages/sdk/src/` | Defines the SDK's public barrel and ensures built-in target adapters are registered for consumers. | [Map](packages/sdk/src/codemap.md) |
| `packages/sdk/src/helpers/` | Provides ergonomic, typed queries over resolved ACF capabilities. | [Map](packages/sdk/src/helpers/codemap.md) |
