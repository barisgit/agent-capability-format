# Spec conformance and maintainability review (branch 9474c12)

## Verdict: do-not-merge — request-changes

Late completion confirms evidence already incorporated: compact MCP configuration is reachable through old caplet emission, so migration corruption is not merely a synthetic case. Verdict unchanged.

Reviewed `a5699cf..9474c12`, branch `plugin-interop-foundation`, read-only. No files changed; final worktree status clean.

## Ranked findings

1. **High — Automatic migration can corrupt unmanaged MCP configuration.**  
   `apps/caplet/src/internal/stale-sweep.ts:205`; defect: `apps/caplet/src/apply/json-pointer.ts:101`.  
   Property deletion starts at the beginning of its line, potentially removing enclosing JSON and unmanaged neighbors. The pure-function probe produced malformed `"user":{"command":"python"}}}`. Historical emission (`a5699cf:packages/adapters/src/common/emitter.ts:306–314`) updates values without reformatting surrounding compact JSON; current matching logic is `packages/adapters/src/common/json-merge.ts:72`. Formatting does not trigger pointer drift.  
   **Fix:** remove exact property/element and comma spans; consume indentation only when entirely whitespace. Add a migration regression using old emission’s compact layout and an unmanaged neighbor.

2. **High — Restore accepts capabilities absent from the lock.**  
   `packages/installer/src/resolve.ts:460`.  
   Comparison checks expected records but never rejects unexpected restored records. A changed local collection can introduce another capability while restoring a missing snapshot. Every record is committed while the old lock remains; an unrecorded native snapshot bypasses digest verification (`packages/core/src/resolver/index.ts:153`).  
   **Fix:** require exact restored/locked capability-set equality before committing.

3. **Medium — Missing-sibling restoration silently replaces a present tampered snapshot.**  
   `packages/installer/src/resolve.ts:315,365`.  
   Restoration materializes and replaces the entire source. Missing `alpha` plus modified installed `beta` overwrites `beta` before verification, violating design line 186.  
   **Fix:** verify present siblings first; restore only missing destinations. Test failure without modifying `beta`.

4. **Medium — Claude package transformation deletes unrelated documentation.**  
   `packages/adapters/src/claude/plugin.ts:378`.  
   Every directory containing `SKILL.md` is pruned, including undeclared `docs/example/`. An in-memory rename probe lost both its example and accompanying notes without diagnostics.  
   **Fix:** prune actual regenerated/excluded skill directories only, recording original paths where necessary.

5. **Medium — Frozen force resolution can fetch a moving ref and rewrite the lock.**  
   `packages/installer/src/resolve.ts:303,479`.  
   Force mode disables the branch that substitutes locked `resolvedSha`; matching intent therefore permits current upstream content under `--frozen --mode force`.  
   **Fix:** reject the combination or enforce locked provenance under frozen resolution.

6. **Medium — Frozen resolution misses removed manifest sources.**  
   `packages/installer/src/drift.ts:29`.  
   Only current manifest entries are checked. Removing a locked source produces no drift, allowing a reduced lock and stale-snapshot deletion.  
   **Fix:** compare source membership in both directions before committing.

7. **Medium — Workflows escape executable reporting and default remainder discovery.**  
   `packages/core/src/targets/plugin-layout.ts:82`; `packages/core/src/formats/claude-plugin.ts:208`.  
   Research documents JavaScript workflows and default discovery (`research/plugin-interop/tools/claude-code.md:471–482,615–618`). The inventories omit them; explicit paths become non-executing `other` components, so ordinary mode-0644 modules receive no executable-change report.  
   **Fix:** register workflow discovery and execution semantics once and consume them in foreign/native collectors.

8. **Medium — Malformed invocation booleans bypass reader validation.**  
   `packages/core/src/formats/skills.ts:150`; `packages/core/src/targets/native-keys.ts:423`.  
   Non-boolean invocation flags remain extras, whose generated-key entries lack value schemas. Invalid skills stay projected instead of receiving the required warning and can block otherwise valid cross-target output.  
   **Fix:** validate native boolean domains before projection, independently of generated-extra conflict rules.

9. **Low — Lossless passthrough changes the manifest executable bit.**  
   `packages/adapters/src/claude/plugin.ts:183`.  
   The manifest is always emitted as `0644`; a `0755` source probe confirmed the change.  
   **Fix:** preserve its walked source mode when rewriting the version.

10. **Low — Remainder-family classification is duplicated.**  
    `packages/core/src/resolver/selection.ts:29`; `packages/core/src/targets/remainder-support.ts:33`.  
    Selection and reporting maintain identical mappings independently.  
    **Fix:** export and reuse one owning-registry mapping.

11. **Low — Executable inventory exceeds the module-size standard.**  
    `packages/core/src/emit/executables.ts:1` — 651 lines against the 600-line starting limit.  
    Collection, native configuration, fingerprinting, reachability, and comparison share one module.  
    **Fix:** extract native-plugin collectors and their layer/fingerprint helpers; retain orchestration and comparison together.

## Maintainability assessment

Not fundamentally an unmaintainable mess, but not merge-ready. The support-cell registry, shared serializers, and typed host boundary are useful. Capability-wide refusals, shared-root withholding, reader/writer translation ownership, and absence of an executable approval gate are implemented.

Consolidating component discovery, family membership, and execution classification is the highest-value simplification—the workflow omission demonstrates their current drift.

Also consider retiring `apps/caplet/src/apply/sidecar.ts:153`’s old deletion engine: no production caller remains, but it is publicly exported and tested. Check external compatibility first.

Golden additions are approximately 6.6% of added lines and cover distinct contracts. No supported false-test or unjustified duplication finding was established. Known backlog follow-ups were excluded.

## Verification and next step

- Reused supplied `bun run ci`: **20/20 Passed**, not rerun.
- Read-only probes reproduced JSON corruption, documentation pruning, and manifest-mode loss; historical/current merging confirms migration reachability.
- Installer findings were verified statically, without mutating restore experiments.
- Authenticated Claude skill/MCP invocation and Codex loading remain documented verification gaps.
- Add focused regressions, correct the contract violations, rerun CI, and review the fixes. No wholesale redesign is necessary.
