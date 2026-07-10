# packages/core/src/resolver/

## Responsibility
Discovers capability repositories and resolves user/project scope trees into effective capabilities.

## Design and Data Flow
Scope discovery finds `~/.agents` and the nearest project `.agents`. Repository discovery recognizes manifests, `acf/` collections, and legacy `skills/`; readers load roots, then collision checks and deterministic deduplication give project scope precedence over user scope.

## Integration
- Calls the core reader and filesystem utilities.
- Supplies capability sets to emit orchestration, installer checks, Caplet, and SDK helpers.
