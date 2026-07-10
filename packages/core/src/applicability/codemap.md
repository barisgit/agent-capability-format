# packages/core/src/applicability/

## Responsibility
Computes and validates which registered targets a capability or facet applies to.

## Design and Data Flow
`computeSet` turns `only`/`except` declarations into target sets; `applicableTargets` intersects facet declarations with capability defaults. Validation reports unknown target IDs and contradictory declarations as diagnostics.

## Integration
- Depends on the target registry and canonical model types.
- Used by reader validation, core emission, Caplet workflows, and SDK facet loading.
