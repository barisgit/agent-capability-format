# packages/core/src/assets/

## Responsibility
Resolves declared references and implicit imported-skill files into normalized asset inputs.

## Design and Data Flow
`collectReferencedAssets` gathers frontmatter and Markdown references, resolves them within capability roots, verifies regular files, deduplicates, and sorts results while appending path diagnostics. `collectImportedSkillAssets` recursively includes portable files beside imported `SKILL.md` entries, excluding hidden paths, `node_modules`, management notices, and primary files, and marks them with `origin: "implicit"`.

## Integration
- Uses canonical facet/asset types and filesystem utilities.
- Called by the capability reader; adapters later read resolved assets for emission.
