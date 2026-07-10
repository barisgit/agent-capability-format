# packages/core/src/emit/

## Responsibility
Orchestrates target-specific emission for resolved capabilities.

## Design and Data Flow
`emit` resolves capabilities per scope, selects requested targets, applies capability/facet applicability, resolves install roots, and invokes each registered target adapter. It aggregates sorted `FileDiff` values and diagnostics by scope/target. `applyApplicability` filters a capability without mutating its source model.

## Integration
- Depends on resolver, applicability, target registry, and emit/model types.
- Called by Caplet/SDK consumers after adapters register themselves.
