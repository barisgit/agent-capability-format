#!/usr/bin/env bash
# Runtime spike for openspec/changes/plugin-interop-foundation tasks 5.1 and 5.2:
# drives the locally installed `claude` plugin/marketplace CLI against throwaway
# HOME and project directories and records every invocation as a transcript
# (argv, exit code, stdout, stderr) plus file snapshots under $SPIKE_ROOT.
#
# Safety contract: every claude invocation runs through `cc`, which refuses to
# run unless HOME and CLAUDE_CONFIG_DIR are inside a fresh mktemp root under
# /tmp. Claude never sees the real ~/.claude, ~/.claude.json, credentials or
# keychain; the script itself only hashes ~/.claude/plugins and
# ~/.claude/settings.json before and after, and exits 98 if they changed. No
# credentials are copied and no model session is started. Claude itself still
# fetches official-marketplace install counts over the network on install.
#
# Usage: research/plugin-interop/tools/claude-spike.sh [phase...]
#   phases: help core session names project failures policy (default: all)
#   FIXTURE_DIR=<dir> also writes normalized fake-CLI fixtures (needs all phases
#   except help), e.g. FIXTURE_DIR=apps/caplet/tests/fixtures/claude-cli
# Output: transcripts in $SPIKE_ROOT/transcripts/<phase>/<step>.json and
#         snapshots in $SPIKE_ROOT/snaps/<phase>-<label>.txt
set -uo pipefail

CLAUDE_BIN=${CLAUDE_BIN:-$(readlink -f "$(command -v claude)")}
REAL_HOME=$HOME
ROOT=$(mktemp -d /tmp/claude-spike.XXXXXX)
export SPIKE_ROOT=$ROOT
NODE_DIR=$(dirname "$(readlink -f "$(command -v node)")")
LOG=$ROOT/mcp-spawn.log
mkdir -p "$ROOT/snaps" "$ROOT/transcripts"

# Refuses any invocation whose HOME is not a child of the throwaway root.
guard() {
  case "$ROOT" in /tmp/claude-spike.*) ;; *) echo "refusing: ROOT=$ROOT" >&2; exit 99 ;; esac
  case "$H" in "$ROOT"/*) ;; *) echo "refusing: HOME=$H not under $ROOT" >&2; exit 99 ;; esac
  case "$H" in "$REAL_HOME" | "$REAL_HOME"/*) echo "refusing: HOME inside real home" >&2; exit 99 ;; esac
}

# fresh <phase>: new empty HOME and project directory for a phase.
fresh() {
  PHASE=$1
  H=$ROOT/$PHASE/home
  P=$ROOT/$PHASE/project
  mkdir -p "$H/.claude" "$P" "$ROOT/transcripts/$PHASE"
  guard
}

# cc <step> <claude args...>: runs claude with a minimal, isolated environment in
# $CWD (default $P) and stores the transcript. EXTRA_ENV adds NAME=value pairs.
cc() {
  local step=$1; shift
  guard
  local cwd=${CWD:-$P} t=$ROOT/transcripts/$PHASE/$step
  # shellcheck disable=SC2086 # EXTRA_ENV is a deliberate word-split list of NAME=value pairs
  (cd "$cwd" && env -i HOME="$H" CLAUDE_CONFIG_DIR="$H/.claude" PATH="$NODE_DIR:/usr/bin:/bin" \
    XDG_CONFIG_HOME="$H/.config" XDG_CACHE_HOME="$H/.cache" XDG_DATA_HOME="$H/.local/share" \
    XDG_STATE_HOME="$H/.local/state" DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 TERM=dumb NO_COLOR=1 ${EXTRA_ENV:-} \
    timeout 90 "$CLAUDE_BIN" "$@" >"$t.out" 2>"$t.err" </dev/null)
  local ec=$?
  # argv goes through a NUL-separated file because jq parses --flags among --args.
  printf '%s\0' claude "$@" >"$t.argv"
  jq -n --arg cwd "$cwd" --arg home "$H" --argjson ec "$ec" --rawfile o "$t.out" --rawfile e "$t.err" \
    --rawfile a "$t.argv" '{argv: ($a | split("\u0000") | .[:-1]), cwd: $cwd, home: $home, exitCode: $ec, stdout: $o, stderr: $e}' >"$t.json"
  rm -f "$t.out" "$t.err" "$t.argv"
  echo "[$PHASE/$step] exit $ec: claude $*"
}

# snap <label>: file listing of HOME and project plus every small JSON file's content.
snap() {
  local out=$ROOT/snaps/$PHASE-$1.txt
  {
    echo "## files"
    (cd "$ROOT/$PHASE" && find . -path ./home/.claude/plugins/marketplaces -prune -o \( -type f -o -type l \) -print | sort)
    for f in $(cd "$ROOT/$PHASE" && find . \( -name '*.json' -o -name SKILL.md \) -size -64k -not -path '*/mkt*/*' -not -path '*/plugins/cache/*' -not -name install-counts-cache.json | sort); do
      echo "## $f"; cat "$ROOT/$PHASE/$f"; echo
    done
  } >"$out"
}

# make_plugin <dir> <name> <version> <body>: Claude plugin with one skill and the
# stdio MCP probes used to measure the server working directory.
make_plugin() {
  local d=$1 name=$2 version=$3 body=$4
  mkdir -p "$d/.claude-plugin" "$d/skills/hello"
  jq -n --arg n "$name" --arg v "$version" '{name: $n, version: $v, description: "spike probe"}' >"$d/.claude-plugin/plugin.json"
  printf -- '---\nname: hello\ndescription: Spike probe skill.\n---\n%s\n' "$body" >"$d/skills/hello/SKILL.md"
  sed "s|@LOG@|$LOG|" "$ROOT/server.js" >"$d/server.js"
  chmod +x "$d/server.js"
  mkdir -p "$ROOT/cwdtarget"
  jq -n --arg n "$name" --arg abs "$ROOT/cwdtarget" '{mcpServers: {
    ($n + "_plain"):   {command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js", ($n + "_plain")]},
    ($n + "_rel"):     {command: "node", args: ["./server.js", ($n + "_rel")]},
    ($n + "_cwdroot"): {command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js", ($n + "_cwdroot")], cwd: "${CLAUDE_PLUGIN_ROOT}"},
    ($n + "_cwdabs"):  {command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js", ($n + "_cwdabs")], cwd: $abs},
    ($n + "_cmdexp"):  {command: "${CLAUDE_PLUGIN_ROOT}/server.js", args: [($n + "_cmdexp")]}
  }}' >"$d/.mcp.json"
}

# make_marketplace <dir> <name> <plugin...>: marketplace listing plugins by ./plugins/<name>.
make_marketplace() {
  local d=$1 name=$2; shift 2
  mkdir -p "$d/.claude-plugin"
  jq -n --arg n "$name" '{name: $n, owner: {name: "spike"}, plugins: [$ARGS.positional[] | {name: ., source: ("./plugins/" + .), description: "spike probe"}]}' \
    --args "$@" >"$d/.claude-plugin/marketplace.json"
  for p in "$@"; do [ -d "$d/plugins/$p" ] || make_plugin "$d/plugins/$p" "$p" "1.0.0+acf.aaa" "BODY-1"; done
}

set_version() { jq --arg v "$2" '.version = $v' "$1/.claude-plugin/plugin.json" >"$1/.v" && mv "$1/.v" "$1/.claude-plugin/plugin.json"; }
set_body() { sed -i "s/^BODY-.*/$2/" "$1/skills/hello/SKILL.md"; }

# Minimal stdio MCP server: logs how it was started, then answers initialize,
# tools/list and ping.
cat >"$ROOT/server.js" <<'EOF'
#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync("@LOG@", JSON.stringify({ tag: process.argv[2], cwd: process.cwd(), argv: process.argv.slice(1),
  CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT, CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA,
  CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR }) + "\n");
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id === undefined) continue;
    let result = {};
    if (msg.method === "initialize") result = { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "spike", version: "0" } };
    if (msg.method === "tools/list") result = { tools: [] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
  }
});
EOF

cache_bodies() { echo "## cache bodies" >>"$ROOT/snaps/$PHASE-$1.txt"; grep -r '^BODY-' "$H/.claude/plugins/cache" >>"$ROOT/snaps/$PHASE-$1.txt" 2>&1 || true; }

phase_help() {
  fresh help
  cc plugin plugin --help
  for s in install list update uninstall enable disable validate; do cc "plugin-$s" plugin "$s" --help; done
  cc marketplace plugin marketplace --help
  for s in add list remove update; do cc "marketplace-$s" plugin marketplace "$s" --help; done
  cc mcp-list mcp list --help
}

# User-scope lifecycle, caching and version behavior, native disable, MCP cwd.
phase_core() {
  fresh core
  local M=$ROOT/core/mkt pd=$ROOT/core/mkt/plugins/probe
  make_marketplace "$M" spike-mkt probe
  snap 00-empty
  cc 01-validate-plugin plugin validate "$pd"
  cc 02-validate-marketplace plugin validate "$M"
  cc 03-marketplace-add-user plugin marketplace add "$M" --scope user
  snap 03-after-marketplace-add
  cc 04-marketplace-list-json plugin marketplace list --json
  cc 04-marketplace-list plugin marketplace list
  cc 05-list-available-json plugin list --json --available
  cc 06-install-user plugin install probe@spike-mkt --scope user
  snap 06-after-install
  cache_bodies 06-after-install
  cc 07-list-json plugin list --json
  cc 07-list plugin list
  cc 08-install-again plugin install probe@spike-mkt --scope user

  set_body "$pd" BODY-2
  cc 10-update-same-version plugin update probe@spike-mkt --scope user
  snap 10-after-update-same-version; cache_bodies 10-after-update-same-version
  cc 11-marketplace-update plugin marketplace update spike-mkt
  cc 12-update-same-version-after-mupdate plugin update probe@spike-mkt --scope user
  snap 12; cache_bodies 12
  cc 13-install-again-changed-content plugin install probe@spike-mkt --scope user
  cache_bodies 13
  cc 14-uninstall-for-reinstall plugin uninstall probe@spike-mkt --scope user
  cc 15-reinstall-same-version plugin install probe@spike-mkt --scope user
  snap 15; cache_bodies 15

  set_body "$pd" BODY-3; set_version "$pd" "1.0.0+acf.bbb"
  cc 20-update-build-meta plugin update probe@spike-mkt --scope user
  snap 20; cache_bodies 20
  cc 21-marketplace-update plugin marketplace update spike-mkt
  cc 22-update-build-meta-after-mupdate plugin update probe@spike-mkt --scope user
  snap 22; cache_bodies 22
  cc 23-list-json plugin list --json

  set_body "$pd" BODY-4; set_version "$pd" "1.0.1+acf.bbb"
  cc 30-marketplace-update plugin marketplace update spike-mkt
  cc 31-update-base-version plugin update probe@spike-mkt --scope user
  snap 31; cache_bodies 31

  set_body "$pd" BODY-5; set_version "$pd" "banana"
  cc 40-validate-nonsemver plugin validate "$pd"
  cc 41-marketplace-update plugin marketplace update spike-mkt
  cc 42-update-nonsemver plugin update probe@spike-mkt --scope user
  snap 42; cache_bodies 42
  cc 43-list-json plugin list --json
  cc 44-update-unchanged plugin update probe@spike-mkt --scope user

  : >"$LOG"
  CWD=$P cc 50-mcp-list mcp list
  cp "$LOG" "$ROOT/snaps/core-50-mcp-spawn.log"

  cc 60-disable plugin disable probe@spike-mkt --scope user
  snap 60-after-disable
  cc 61-list-json-disabled plugin list --json
  cc 62-disable-again plugin disable probe@spike-mkt --scope user
  set_body "$pd" BODY-6; set_version "$pd" "1.0.2"
  cc 63-marketplace-update plugin marketplace update spike-mkt
  cc 64-update-while-disabled plugin update probe@spike-mkt --scope user
  cc 65-list-json-after-update-disabled plugin list --json
  : >"$LOG"
  cc 66-mcp-list-disabled mcp list
  cp "$LOG" "$ROOT/snaps/core-66-mcp-spawn.log"
  cc 67-enable plugin enable probe@spike-mkt --scope user
  cc 68-list-json-enabled plugin list --json
  cc 69-disable-before-install plugin disable probe@spike-mkt --scope user
  set_body "$pd" BODY-7
  cc 69b-install-while-disabled plugin install probe@spike-mkt --scope user
  cache_bodies 69b
  cc 69c-list-json-after-install-while-disabled plugin list --json
  cc 69d-enable-already-enabled plugin enable probe@spike-mkt --scope user

  cc 70-uninstall plugin uninstall probe@spike-mkt --scope user
  snap 70-after-uninstall
  cc 71-list-json-empty plugin list --json
  cc 72-marketplace-remove plugin marketplace remove spike-mkt
  snap 72-after-marketplace-remove
  cc 73-marketplace-list-json-empty plugin marketplace list --json
}

# Which directory plugin stdio servers start in when claude runs from a
# subdirectory of a git project: health check and an unauthenticated print run.
phase_session() {
  fresh session
  local M=$ROOT/session/mkt
  make_marketplace "$M" spike-mkt probe
  (cd "$P" && git init -q . && mkdir -p sub)
  cc 01-marketplace-add plugin marketplace add "$M" --scope user
  cc 02-install plugin install probe@spike-mkt --scope user
  : >"$LOG"
  CWD=$P/sub cc 03-mcp-list-from-subdir mcp list
  cp "$LOG" "$ROOT/snaps/session-03-mcp-spawn.log"
  : >"$LOG"
  CWD=$P/sub cc 04-print-unauthenticated -p hello --output-format json
  cp "$LOG" "$ROOT/snaps/session-04-mcp-spawn.log"
}

# Are marketplace names global across scopes and directories?
phase_names() {
  fresh names
  local A=$ROOT/names/mktA B=$ROOT/names/mktB
  make_marketplace "$A" same-name probe
  make_marketplace "$B" same-name other
  cc 01-add-A-user plugin marketplace add "$A" --scope user
  cc 02-add-A-project plugin marketplace add "$A" --scope project
  cc 03-add-B-user plugin marketplace add "$B" --scope user
  cc 04-add-B-project plugin marketplace add "$B" --scope project
  cc 05-add-B-local plugin marketplace add "$B" --scope local
  cc 06-marketplace-list-json plugin marketplace list --json
  snap 06
  cc 07-install-other plugin install other@same-name --scope project
  cc 08-install-probe plugin install probe@same-name --scope project
  cc 09-list-json plugin list --json
  snap 09
  # Project declares A while the global record points at B.
  cc 10-add-A-project-while-B-known plugin marketplace add "$A" --scope project
  cc 11-marketplace-list-json plugin marketplace list --json
  snap 11
  cc 12-marketplace-remove-with-installed plugin marketplace remove same-name
  cc 13-list-json-after-remove plugin list --json
  snap 13
}

# Task 5.2: what project- and local-scope registration writes.
phase_project() {
  fresh project
  local M=$P/.claude/.acf/marketplace
  make_marketplace "$M" acf-project-spike probe local1
  (cd "$P" && git init -q .)
  snap 00
  cc 01-marketplace-add-project-relative plugin marketplace add ./.claude/.acf/marketplace --scope project
  snap 01-after-marketplace-add-project
  cc 02-marketplace-list-json plugin marketplace list --json
  cc 03-install-project plugin install probe@acf-project-spike --scope project
  snap 03-after-install-project
  cc 04-install-local plugin install local1@acf-project-spike --scope local
  snap 04-after-install-local
  cc 05-list-json plugin list --json
  cc 06-disable-local plugin disable probe@acf-project-spike --scope local
  snap 06-after-disable-local
  cc 07-list-json-after-local-disable plugin list --json
  set_body "$M/plugins/probe" BODY-2; set_version "$M/plugins/probe" "1.0.1+acf.bbb"
  cc 08-update-project-default-scope plugin update probe@acf-project-spike
  cc 09-update-project plugin update probe@acf-project-spike --scope project
  snap 09-after-update-project
  # Same layout registered with an absolute path from a second fresh home.
  local H1=$H
  H=$ROOT/project/home-abs; mkdir -p "$H/.claude"
  P=$ROOT/project/project-abs; mkdir -p "$P"; cp -r "$ROOT/project/project/.claude" "$P/"; rm -f "$P/.claude/settings.json" "$P/.claude/settings.local.json"
  cc 10-marketplace-add-project-absolute plugin marketplace add "$P/.claude/.acf/marketplace" --scope project
  cc 11-marketplace-add-local plugin marketplace add "$P/.claude/.acf/marketplace" --scope local
  snap 11-absolute
  # Teammate: clone of the registered project with an empty home.
  H=$ROOT/project/home-teammate; mkdir -p "$H/.claude"
  P=$ROOT/project/project-teammate; mkdir -p "$P"; cp -r "$ROOT/project/project/.claude" "$P/"; rm -f "$P/.claude/settings.local.json"
  cc 20-teammate-marketplace-list-json plugin marketplace list --json
  cc 21-teammate-list-json plugin list --json
  cc 22-teammate-list-available-json plugin list --json --available
  cc 23-teammate-install-project plugin install probe@acf-project-spike --scope project
  cc 24-teammate-list-json plugin list --json
  snap 24-teammate
  H=$H1; P=$ROOT/project/project
  cc 30-uninstall-project plugin uninstall probe@acf-project-spike --scope project
  cc 31-uninstall-wrong-scope plugin uninstall local1@acf-project-spike --scope project
  cc 32-uninstall-local plugin uninstall local1@acf-project-spike --scope local
  cc 33-marketplace-remove plugin marketplace remove acf-project-spike
  snap 33-after-remove
}

phase_failures() {
  fresh failures
  local M=$ROOT/failures/mkt
  make_marketplace "$M" spike-mkt probe
  cc 01-marketplace-add-missing-dir plugin marketplace add "$ROOT/failures/nope" --scope user
  cc 02-marketplace-add-bad-scope plugin marketplace add "$M" --scope managed
  cc 03-marketplace-add plugin marketplace add "$M" --scope user
  cc 04-marketplace-add-again plugin marketplace add "$M" --scope user
  cc 05-install-unknown-plugin plugin install nope@spike-mkt --scope user
  cc 06-install-unknown-marketplace plugin install probe@nope-mkt --scope user
  cc 07-uninstall-not-installed plugin uninstall probe@spike-mkt --scope user
  cc 08-update-not-installed plugin update probe@spike-mkt --scope user
  cc 09-enable-not-installed plugin enable probe@spike-mkt --scope user
  cc 10-disable-not-installed plugin disable probe@spike-mkt --scope user
  snap 10-after-enable-disable-not-installed
  cc 11-install-bare-name plugin install probe --scope user
  cc 12-marketplace-remove-unknown plugin marketplace remove nope-mkt
  cc 13-marketplace-update-unknown plugin marketplace update nope-mkt
  cc 14-install-bad-scope plugin install probe@spike-mkt --scope managed
  echo '{not json' >"$M/.claude-plugin/marketplace.json"
  cc 15-marketplace-update-broken plugin marketplace update spike-mkt
  cc 16-install-broken-marketplace plugin install probe@spike-mkt --scope user
}

# Policy block without root: only policySettings sources are honored for
# strictKnownMarketplaces/blockedMarketplaces. Probe user settings and the
# remote-settings override file.
phase_policy() {
  fresh policy
  local M=$ROOT/policy/mkt
  make_marketplace "$M" spike-mkt probe
  local pol='{"strictKnownMarketplaces":[{"source":"github","repo":"example/allowed"}],"blockedMarketplaces":[{"source":"directory","path":"'"$M"'"}]}'
  echo "$pol" >"$H/.claude/settings.json"
  cc 01-user-settings-strict plugin marketplace add "$M" --scope user
  cc 02-marketplace-remove plugin marketplace remove spike-mkt
  rm "$H/.claude/settings.json"
  echo "$pol" >"$ROOT/policy/remote-settings.json"
  EXTRA_ENV="CLAUDE_CODE_REMOTE_SETTINGS_PATH=$ROOT/policy/remote-settings.json" cc 03-remote-override-strict plugin marketplace add "$M" --scope user
  echo '{"strictKnownMarketplaces":[{"source":"github","repo":"example/allowed"}]}' >"$ROOT/policy/remote-strict-only.json"
  EXTRA_ENV="CLAUDE_CODE_REMOTE_SETTINGS_PATH=$ROOT/policy/remote-strict-only.json" cc 04-remote-override-strict-only plugin marketplace add "$M" --scope user
  cc 05-marketplace-add plugin marketplace add "$M" --scope user
  EXTRA_ENV="CLAUDE_CODE_REMOTE_SETTINGS_PATH=$ROOT/policy/remote-settings.json" cc 06-install-under-block plugin install probe@spike-mkt --scope user
  snap 06
}

# fixture <scenario> <phase/step> <notes>: fake-CLI fixture from a transcript
# with throwaway paths replaced by placeholders (longest path first).
fixture() {
  local name=$1 src=$2 notes=$3 phase=${2%%/*}
  jq --arg notes "$notes" --arg r "$ROOT" --arg ph "$phase" '
    def norm: reduce (
        [$r + "/" + $ph + "/home-teammate", "<HOME>"], [$r + "/" + $ph + "/project-teammate", "<PROJECT>"],
        [$r + "/" + $ph + "/home-abs", "<HOME>"], [$r + "/" + $ph + "/project-abs", "<PROJECT>"],
        [$r + "/" + $ph + "/home", "<HOME>"], [$r + "/" + $ph + "/project", "<PROJECT>"],
        [$r + "/" + $ph + "/mktA", "<MARKETPLACE_DIR_A>"], [$r + "/" + $ph + "/mktB", "<MARKETPLACE_DIR_B>"],
        [$r + "/" + $ph + "/mkt", "<MARKETPLACE_DIR>"], [$r + "/cwdtarget", "<CWD_TARGET>"], [$r, "<SPIKE_ROOT>"]
      ) as $p (.; split($p[0]) | join($p[1]));
    {argv: (.argv | map(norm)), exitCode, stdout: (.stdout | norm), stderr: (.stderr | norm), notes: $notes}
  ' "$ROOT/transcripts/$src.json" >"$FIXTURE_DIR/$name.json"
}

# Scenario fixtures consumed by the caplet Claude host port tests (task 5.7).
write_fixtures() {
  mkdir -p "$FIXTURE_DIR"
  local c="cwd <PROJECT>, fresh <HOME>"
  fixture marketplace-add-user core/03-marketplace-add-user "$c. Writes extraKnownMarketplaces.<name> {source:{source:directory,path:<abs>}} to <HOME>/.claude/settings.json and <HOME>/.claude/plugins/known_marketplaces.json (installLocation = the directory itself, no copy)."
  fixture marketplace-add-project project/01-marketplace-add-project-relative "$c, git repo. Relative argument is resolved: <PROJECT>/.claude/settings.json gets the ABSOLUTE path in extraKnownMarketplaces; the user-level known_marketplaces.json also records it."
  fixture marketplace-add-already-known failures/04-marketplace-add-again "$c. Re-adding a known name exits 0 with 'already on disk'; the same text appears when another scope already registered the name."
  fixture marketplace-add-missing-dir failures/01-marketplace-add-missing-dir "$c. Nonexistent local path."
  fixture marketplace-add-invalid-scope failures/02-marketplace-add-bad-scope "$c. managed is not an accepted scope."
  fixture marketplace-list-json core/04-marketplace-list-json "$c. One entry per known marketplace name; no scope field."
  fixture marketplace-list-json-empty core/73-marketplace-list-json-empty "$c. After marketplace remove."
  fixture marketplace-update core/11-marketplace-update "$c. Directory marketplace refresh; needed neither for content nor version pickup (plugin update reads the directory directly)."
  fixture marketplace-update-invalid-manifest failures/15-marketplace-update-broken "$c. marketplace.json is not valid JSON."
  fixture marketplace-update-unknown failures/13-marketplace-update-unknown "$c."
  fixture marketplace-remove core/72-marketplace-remove "$c. Removes the declaration from every scope's settings and uninstalls that marketplace's plugins in every scope (see names/12)."
  fixture marketplace-remove-unknown failures/12-marketplace-remove-unknown "$c."
  fixture install-user core/06-install-user "$c. Copies the plugin to <HOME>/.claude/plugins/cache/<marketplace>/<plugin>/<version with + replaced by ->/ and sets enabledPlugins true in user settings."
  fixture install-already-installed core/08-install-again "$c. Exit 0 and the same success text; no reinstall."
  fixture install-project project/03-install-project "$c. enabledPlugins in <PROJECT>/.claude/settings.json; install record (with projectPath) and cache stay under <HOME>."
  fixture install-local project/04-install-local "$c. enabledPlugins in <PROJECT>/.claude/settings.local.json; Claude appends **/.claude/settings.local.json to the user's global git ignore (\$XDG_CONFIG_HOME/git/ignore)."
  fixture marketplace-add-local project/11-marketplace-add-local "$c. --scope local after the same directory was added at project scope: exit 0, already on disk; writes the record to <PROJECT>/.claude/settings.local.json."
  fixture install-unknown-plugin failures/05-install-unknown-plugin "$c. Marketplace known, plugin not listed."
  fixture install-unknown-marketplace failures/06-install-unknown-marketplace "$c. Same message shape as an unknown plugin; only the exit code (1) is reliable."
  fixture install-invalid-scope failures/14-install-bad-scope "$c."
  fixture list-json-installed core/07-list-json "$c. Array of {id, version, scope, enabled, installPath, installedAt, lastUpdated, mcpServers}; mcpServers omits the server cwd key."
  fixture list-json-disabled core/61-list-json-disabled "$c. After plugin disable --scope user: enabled false, entry kept."
  fixture list-json-empty core/71-list-json-empty "$c."
  fixture list-json-after-update core/23-list-json "$c. After update-changed (1.0.0+acf.aaa -> 1.0.0+acf.bbb): version bumped, still enabled."
  fixture list-json-after-update-while-disabled core/65-list-json-after-update-disabled "$c. After update-while-disabled: new version, enabled stays false."
  fixture list-json-available core/05-list-available-json "$c. --available changes the shape to {installed: [...], available: [{pluginId, name, description, marketplaceName, source}]}."
  fixture list-json-project-and-local project/05-list-json "$c. Project and local entries carry projectPath."
  fixture list-json-local-disable-of-project-plugin project/07-list-json-after-local-disable "$c. After disable --scope local of a project-scope plugin: one entry, scope project, enabled false; the local origin of the disable is not shown (it is in settings.local.json)."
  fixture update-changed core/20-update-build-meta "$c. Only build metadata changed (1.0.0+acf.aaa -> 1.0.0+acf.bbb) with new content; picked up without marketplace update."
  fixture update-unchanged-version core/10-update-same-version "$c. Content changed but version unchanged: not picked up, cache keeps old content."
  fixture update-unchanged core/44-update-unchanged "$c. Nothing changed."
  fixture install-again-changed-content core/13-install-again-changed-content "$c. install of an installed plugin after a content change without a version change: exit 0 and the cache directory of that version is refreshed with the new content."
  fixture install-while-disabled core/69b-install-while-disabled "$c. install of an installed plugin the user disabled: exit 0, refreshes same-version content and RE-ENABLES the plugin (enabledPlugins true)."
  fixture list-json-after-install-while-disabled core/69c-list-json-after-install-while-disabled "$c. After install of a disabled plugin: enabled true."
  fixture enable-already-enabled core/69d-enable-already-enabled "$c."
  fixture update-while-disabled core/64-update-while-disabled "$c. Updates a disabled plugin and keeps it disabled."
  fixture update-project project/09-update-project "$c. --scope project required; message names the project path."
  fixture update-wrong-scope project/08-update-project-default-scope "$c. Default scope is user; a project-scope plugin is 'not installed at scope user'."
  fixture update-not-installed failures/08-update-not-installed "$c."
  fixture uninstall-user core/70-uninstall "$c. Removes the install record and the enabledPlugins key; cache directories stay with an .orphaned_at marker."
  fixture uninstall-not-installed failures/07-uninstall-not-installed "$c."
  fixture uninstall-local project/32-uninstall-local "$c. Plugin installed at local scope."
  fixture uninstall-wrong-scope project/31-uninstall-wrong-scope "$c. Plugin installed at local scope."
  fixture disable-user core/60-disable "$c. Writes enabledPlugins.<id> false in the scope's settings file."
  fixture disable-already-disabled core/62-disable-again "$c."
  fixture enable-user core/67-enable "$c."
  fixture enable-not-installed failures/09-enable-not-installed "$c. Succeeds and writes enabledPlugins true for a plugin that is not installed."
  fixture mcp-list-plugin-servers core/50-mcp-list "$c. Health check spawns plugin stdio servers in claude's working directory; \${CLAUDE_PLUGIN_ROOT} expands in command and args; ./server.js fails because the cwd is not the plugin root; the cwd key is ignored."
}

# Fingerprint of the real Claude state; the run fails if the plugin tree or
# user settings change. ~/.claude.json is reported only, because the user's own
# live sessions also write it.
real_state() {
  echo "plugins=$(cd "$REAL_HOME/.claude/plugins" 2>/dev/null && find . -type f -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -c1-16)"
  echo "settings=$(sha256sum "$REAL_HOME/.claude/settings.json" 2>/dev/null | cut -c1-16)"
}
BEFORE=$(real_state)
CLAUDE_JSON_BEFORE=$(stat -c %y "$REAL_HOME/.claude.json" 2>/dev/null)

phases=("$@")
[ ${#phases[@]} -gt 0 ] || phases=(help core session names project failures policy)
for ph in "${phases[@]}"; do "phase_$ph"; done
[ -z "${FIXTURE_DIR:-}" ] || write_fixtures
echo "SPIKE_ROOT=$ROOT"
AFTER=$(real_state)
echo "real state before: $BEFORE ~/.claude.json mtime $CLAUDE_JSON_BEFORE"
echo "real state after:  $AFTER ~/.claude.json mtime $(stat -c %y "$REAL_HOME/.claude.json" 2>/dev/null)"
[ "$BEFORE" = "$AFTER" ] || { echo "REAL CLAUDE STATE CHANGED" >&2; exit 98; }
