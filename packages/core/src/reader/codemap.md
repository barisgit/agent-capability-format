# packages/core/src/reader/

## Responsibility
Reads an ACF capability directory into the canonical in-memory model and diagnostics.

## Design and Data Flow
`readCapability` detects the `.acf-import.json` synthesis marker, selects the manifest form, parses Markdown/YAML facets, validates names/frontmatter and cross-field constraints, and collects assets. Imported skills accept common ecosystem frontmatter, receive an in-memory description fallback with a warning when needed, are marked synthesized, and gain implicit portable assets without changing source files. Helpers provide reusable Markdown parsing and deterministic diagnostics.

## Integration
- Depends on schemas, assets, diagnostics, target registry, runtime taxonomy, and filesystem helpers.
- Used by repository/scope resolution; parsing and validation helpers are public exports.
