#!/usr/bin/env bash
# Task 7.3 dogfood (openspec/changes/plugin-interop-foundation): installs one public Claude
# plugin and one public Agent Plugins package with the worktree's built caplet, for Claude at
# user and project scope and for Codex (loose), migrates a loose Claude install, and exercises
# status, update, apply, disable and remove. Every caplet and claude call runs isolated (see
# caplet-dogfood-lib.sh); results are recorded in research/plugin-interop/dogfood-7.3.md.
#
# Usage: bun run build && research/plugin-interop/tools/caplet-dogfood.sh [phase...]
#   phases: a-project a-user b-project b-user c-codex d-migration e-update f-repro g-ref-edit (default: all)
# Output: $ROOT/log/<phase>/<step>.txt and $ROOT/snaps/<phase>-<label>.txt (ROOT is printed).
set -uo pipefail
# shellcheck source=research/plugin-interop/tools/caplet-dogfood-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/caplet-dogfood-lib.sh"

CPO=github:anthropics/claude-plugins-official
CPO_SHA=315c4e48967d9541c29c3c656441dded353ca7aa
# Last commit before frontend-design's 2026-09-01 SKILL.md change.
CPO_OLD_SHA=d029127f7d29bdb8fd8902ac34dd7d5c8ba92b6e
MEM0=github:mem0ai/mem0
MEM0_SHA=b7ad69afda6b6ed030347c66d48a13e4de9dec08

# snap <label>: files under HOME and project (sources, clones and Claude's marketplace copies
# pruned) plus the content of the small JSON/TOML/Markdown files caplet and Claude write.
snap() {
  local out=$ROOT/snaps/$PHASE-$1.txt
  mkdir -p "$ROOT/snaps"
  {
    echo "## files"
    (cd "$ROOT/$PHASE" && find . \( -path '*/.agents/.cache' -o -path '*/.agents/capabilities' \
      -o -path '*/plugins/marketplaces' -o -path '*/plugins/cache/*/*/*' -o -name '.git' \) -prune -print -o \
      \( -type f -o -type l \) -print | sort)
    for f in $(cd "$ROOT/$PHASE" && find . \( -path '*/.agents/.cache' -o -path '*/.agents/capabilities' -o -path '*/plugins/marketplaces' -o -path '*/plugins/cache' \) -prune -o \
      -type f \( -name '*.json' -o -name '*.toml' -o -name '*.yml' -o -name 'capabilities.lock' -o -name 'ignore' \) \
      -size -64k -not -name 'install-counts-cache.json' -not -name '.claude.json' -print | sort); do
      echo "## $f"; cat "$ROOT/$PHASE/$f"; echo
    done
  } | redact >"$out"
}

# host <label>: Claude's view of plugins, marketplaces and MCP servers from $P.
host() {
  cc "$1-plugin-list" plugin list --json
  cc "$1-marketplace-list" plugin marketplace list --json
  cc "$1-mcp-list" mcp list
}

exclude_mcp() { printf '    exclude:\n      mcp:\n        - %s\n' "$2" >>"$1"; }

phase_a_project() {
  fresh a-project
  # A git checkout, so Claude's local-scope write can update the global git ignore (D25).
  git -C "$P" init -q
  cc claude-version --version
  cc plugin-help plugin --help
  cap init init
  cap add add "$CPO" --path plugins/example-plugin --pin "$CPO_SHA" -s project -t claude
  host after-add
  cc validate plugin validate "$P/.claude/.acf/marketplace/plugins/example-plugin"
  snap after-add
  # (e) lifecycle on the installed project plugin.
  cap status status
  cap status-json status --json
  cap list list
  cap show show example-plugin
  cap check check
  cap update update
  cap reapply apply -s project -t claude
  host after-update
  snap after-update
  local mkt
  mkt=$(jq -r 'keys[] | select(startswith("acf-project-"))' <"$H/.claude/plugins/known_marketplaces.json")
  cc disable plugin disable "example-plugin@$mkt" --scope local
  cap apply-after-disable apply -s project -t claude
  host after-disable
  cap remove remove example-plugin -s project
  host after-remove
  snap after-remove
  cap apply-after-remove apply -s project -t claude
  host after-remove-apply
  snap after-remove-apply
  # Repro: repeated --target is documented as repeatable.
  cap repeat-target-dry-run add "$CPO" --path plugins/frontend-design --pin "$CPO_SHA" -s project -t claude -t codex --no-apply
  cap repeat-target-apply-dry apply -n -s project -t claude -t codex
}

phase_a_user() {
  fresh a-user
  cap add add "$CPO" --path plugins/example-plugin --pin "$CPO_SHA" -s user -t claude
  host after-add
  snap after-add
  cap status status
  cap reapply apply -s user -t claude
  cap remove remove example-plugin -s user
  host after-remove
  snap after-remove
  cap apply-after-remove apply -s user -t claude
  host after-remove-apply
}

phase_b_project() {
  fresh b-project
  cap init init
  cap add add "$MEM0" --path integrations/mem0-agent-plugin --pin "$MEM0_SHA" -s project -t claude
  host after-refusal
  exclude_mcp "$P/.agents/capabilities.yml" mem0
  cap apply-excluded apply -s project -t claude
  host after-exclude
  cc validate plugin validate "$P/.claude/.acf/marketplace/plugins/mem0"
  snap after-exclude
  cap status status
  cap remove remove mem0 -s project
  host after-remove
}

phase_b_user() {
  fresh b-user
  cap add add "$MEM0" --path integrations/mem0-agent-plugin --pin "$MEM0_SHA" -s user -t claude
  exclude_mcp "$H/.agents/capabilities.yml" mem0
  cap apply-excluded apply -s user -t claude
  host after-exclude
  snap after-exclude
  cap remove remove mem0 -s user
  host after-remove
}

phase_c_codex() {
  fresh c-codex
  cap init init
  cap add-claude-plugin add "$CPO" --path plugins/example-plugin --pin "$CPO_SHA" -s project -t codex
  cap add-agent-plugin add "$MEM0" --path integrations/mem0-agent-plugin --pin "$MEM0_SHA" -s project -t codex
  cap add-claude-plugin-user add "$CPO" --path plugins/example-plugin --pin "$CPO_SHA" -s user -t codex
  cap add-agent-plugin-user add "$MEM0" --path integrations/mem0-agent-plugin --pin "$MEM0_SHA" -s user -t codex
  cap status status
  cap reapply apply -t codex
  snap installed
  cap remove-project remove example-plugin mem0 -s project -t codex
  cap remove-user remove example-plugin mem0 -s user -t codex
  snap removed
}

phase_d_migration() {
  fresh d-migration
  cap init init
  printf 'targets:\n  claude:\n    carrier: loose\n' >"$P/.agents/caplet.yml"
  cap add-loose add "$CPO" --path plugins/frontend-design --pin "$CPO_SHA" -s project -t claude
  host loose
  snap loose
  rm "$P/.agents/caplet.yml"
  cap migrate-dry-run apply -n -s project -t claude
  cap migrate apply -s project -t claude
  host migrated
  snap migrated
  cap migrate-again apply -s project -t claude
  # The same at user scope, with the override in the user caplet.yml.
  mkdir -p "$H/.agents"
  printf 'targets:\n  claude:\n    carrier: loose\n' >"$H/.agents/caplet.yml"
  cap user-add-loose add "$CPO" --path plugins/frontend-design --pin "$CPO_SHA" -s user -t claude
  rm "$H/.agents/caplet.yml"
  cap user-migrate apply -s user -t claude
  host user-migrated
  snap user-migrated
  # Loose refusal of a foreign Claude plugin with remainder (D9).
  printf 'targets:\n  claude:\n    carrier: loose\n' >"$P/.agents/caplet.yml"
  cap loose-remainder add "$CPO" --path plugins/example-plugin --pin "$CPO_SHA" -s project -t claude
  host rolled-back
  snap rolled-back
}

# A real version change: frontend-design at an older commit, then the pinned commit.
phase_e_update() {
  fresh e-update
  cap init init
  cap add-old add "$CPO" --path plugins/frontend-design --pin "$CPO_OLD_SHA" -s project -t claude
  host old
  sed -i "s/$CPO_OLD_SHA/$CPO_SHA/" "$P/.agents/capabilities.yml"
  cap update update frontend-design -s project -t claude
  host updated
  cap reapply apply -s project -t claude
  host reapplied
  snap reapplied
  cap update-unchanged update frontend-design -s project -t claude
}

# Repro: editing an entry's ref, then applying.
phase_g_ref_edit() {
  fresh g-ref-edit
  cap init init
  cap add-old add "$CPO" --path plugins/frontend-design --pin "$CPO_OLD_SHA" -s project -t codex
  sed -i "s/$CPO_OLD_SHA/$CPO_SHA/" "$P/.agents/capabilities.yml"
  cap apply-1 apply -s project -t codex
  cap apply-2 apply -s project -t codex
}

# Repro for repeated --target (help: repeatable).
phase_f_repro() {
  fresh f-repro
  cap init init
  cap add-no-apply add "$MEM0" --path integrations/mem0-agent-plugin --pin "$MEM0_SHA" -s project --no-apply
  cap repeated-target apply -n -s project -t codex -t pi
  cap single-target apply -n -s project -t codex
}

dog_init
echo "ROOT=$ROOT"
phases=("$@")
[ ${#phases[@]} -gt 0 ] || phases=(a-project a-user b-project b-user c-codex d-migration e-update f-repro g-ref-edit)
for phase in "${phases[@]}"; do
  "phase_${phase//-/_}"
  real_state_check
done
