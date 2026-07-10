# packages/core/src/reader/

## Responsibility
Reads an ACF capability directory into the canonical in-memory model and diagnostics.

## Design and Data Flow
`readCapability` selects the manifest form, parses Markdown/YAML facet families, validates names/frontmatter and unknown fields, reads hooks/MCP/skills/assets, then runs cross-field validation. Helpers provide deterministic parsing/sorting; `validation.ts` enforces taxonomy, target support, hook, and applicability constraints.

## Integration
- Depends on schemas, assets, diagnostics, target registry, runtime taxonomy, and filesystem helpers.
- Used by repository/scope resolution and re-exported by validator.
