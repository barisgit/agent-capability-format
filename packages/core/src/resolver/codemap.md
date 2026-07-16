# packages/core/src/resolver/

## Responsibility
Discovers capability repositories and resolves user/project scope trees into effective capabilities.

## Design and Data Flow
Scope discovery finds `~/.agents` and the nearest project `.agents`; repository discovery recognizes root manifests and nested `acf/` collections. Readers load discovered roots without synthesizing or writing manifests, then same-scope collision diagnostics and deterministic deduplication give project scope precedence over user scope.

## Integration
- Calls the core reader and filesystem utilities through read-only discovery.
- Supplies capability sets to emit orchestration, installer checks, Caplet, and SDK helpers.
