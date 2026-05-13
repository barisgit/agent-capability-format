# ACF Hooks Design Questions

Scratch file for resolving ACF hook design. This replaces the previous draft, which incorrectly treated hooks as arbitrary named entries. This version starts from the corrected premise: hooks are organized around a small set of lifecycle hook types/events such as pre-tool, post-tool, and user-prompt-submit.

For each question, leave **Your answer** blank if you agree with the recommendation. Write only disagreements, refinements, or examples you want preserved.

Do not treat this as spec text yet. It is a decision worksheet.

## Current constraints already settled elsewhere

- Hooks live in `hooks/hooks.yml` or `hooks/hooks.yaml`.
- ACF source config is YAML-only. JSON/TOML/native hook files are emitted artifacts, not ACF source.
- Hooks need canonical and target-specific forms.
- ACF is not a universal hook runtime, but a future generic runner/SDK remains possible.
- Canonical runtime-facing selectors must not use target-native tool names like Claude `Bash`, Codex `apply_patch`, OpenCode `read`, or Pi `bash`.
- Portable selectors reference registry-defined operations/resources/events where needed; the registry/taxonomy owns meanings and target mappings.
- `targets.<target>` is target-specific extension data, not a deep merge, replacement object, or copy-through native file.
- Unsupported or lossy hook emission must produce diagnostics governed by package/tool policy.

## Research notes from current target hook models

Claude Code and Codex both organize hooks as:

1. hook event/lifecycle name,
2. matcher group, and
3. one or more handlers.

Claude has a very broad event set (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`, compaction, file/config/worktree events, etc.). Codex's current public hook docs center on a smaller useful set (`SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`). OpenCode plugins expose event names like `tool.execute.before`, `tool.execute.after`, `permission.asked`, `session.compacted`, and many UI/message/session events. Pi/oh-my-pi extensions expose a pre/post tool core (`tool_call`, `tool_result`) plus agent/session/context events such as `before_agent_start`, `context`, `session.compacting`, and session lifecycle hooks.

The shared cross-target center is not arbitrary hook objects. It is a small lifecycle taxonomy:

- before a tool/operation executes,
- after a tool/operation completes,
- before or when a user prompt is submitted,
- session start / initialization,
- stop / turn completion,
- permission request / approval gate,
- compaction/context lifecycle in some runtimes.

---

## Q1 — Should `hooks/hooks.yml` be keyed by hook type/event?

### Context

Your correction is that hooks are not a list of arbitrary named hook units. Native systems mostly expose a small number of lifecycle events. Claude/Codex literally key config by event names (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`). OpenCode plugins use event strings (`tool.execute.before`, `tool.execute.after`). Pi exposes event registration (`tool_call`, `tool_result`).

ACF should mirror that mental model canonically: authors should open `hooks/hooks.yml` and see hook event buckets, not a flat list of vaguely named hook objects.

Hooks are not conditionally activated like instructions. The hook type/event itself is the trigger; the hook always fires when the event fires. `match` is an optional event filter that narrows which event instances reach the handler (for example operation, paths, regex over event payload). It is not instruction-style activation, and there is no zero-token-until-trigger gating: the hook simply runs when the event fires and the filter passes.

### Options

1. `hooks/hooks.yml` is keyed by canonical hook type/event.
2. `hooks/hooks.yml` is a flat `hooks: []` array with each entry declaring `event`.
3. Both shapes are canonical.

### Recommendation

Use **option 1**.

Suggested direction:

```yaml
pre_tool:
  - name: block-dangerous-shell
    match:
      operation: shell
    run:
      command: ./pre-tool/block-dangerous-shell.ts

post_tool:
  - name: review-shell-output
    match:
      operation: shell
    run:
      command: ./post-tool/review-shell-output.ts

user_prompt_submit:
  - name: check-secrets
    match:
      conditions:
        - "sk-[A-Za-z0-9]"
    run:
      command: ./prompt/check-secrets.ts
```

Why: it matches how hooks are actually exposed by Claude/Codex/OpenCode/Pi, keeps the number of hook categories visible, and avoids inventing arbitrary hook entries as if hooks were skills.

### Your answer

Accepted. Reframed: hooks are event-driven, `match` is an optional event filter, not instruction-style activation.

---

## Q2 — What are the initial canonical hook types?

### Context

The initial set should be small, cross-target, and useful. If we include Claude's entire event list immediately, ACF becomes a large lifecycle/runtime spec. If we include only pre/post tool, we miss obvious prompt and turn hooks that Codex/Claude both support and that are important for safety and automation.

The question is not whether targets have more events. They do. The question is which ACF hook types are canonical first, with everything else under target extensions or future expansion.

### Options

1. Minimal: `pre_tool`, `post_tool`, `user_prompt_submit`.
2. Practical core: `session_start`, `user_prompt_submit`, `pre_tool`, `permission_request`, `post_tool`, `stop`.
3. Large lifecycle set including compaction, file changes, config changes, worktrees, subagents, notifications, etc.

### Recommendation

Use **option 2** as the initial canonical core, extended with `pre_compact`:

```txt
session_start
user_prompt_submit
pre_tool
permission_request
post_tool
stop
pre_compact
```

`pre_compact` mirrors the `pre_*` naming convention and matches widely-supported compaction hooks (Claude `PreCompact`, Pi `session.compacting`, OpenCode `experimental.session.compacting`). `post_compact` may be added later if needed.

Why: this maps well to Claude and Codex; OpenCode/Pi can map at least the tool/session/prompt-ish subset; it covers the main automation cases: setup/context, prompt validation, tool guardrails, permission policy, post-tool review, turn-completion enforcement, and pre-compaction context preservation.

Keep file/config/subagent/worktree events as target-specific or future canonical additions.

### Your answer

Accepted with `pre_compact` added to the canonical core.


---

## Q3 — Should canonical hook type names be snake_case?

### Context

Native event names vary: Claude/Codex use PascalCase (`PreToolUse`), OpenCode uses dotted lower-case (`tool.execute.before`), Pi uses snake-ish strings (`tool_call`). ACF needs one author-facing convention.

We already use lower-case slug-like names elsewhere and canonical target ids are lower-case. Snake-case event names are readable and avoid target-native naming style.

### Options

1. Use snake_case: `pre_tool`, `post_tool`, `user_prompt_submit`.
2. Use Claude/Codex PascalCase: `PreToolUse`, `PostToolUse`.
3. Use dotted event names: `tool.execute.before`.

### Recommendation

Use **option 1**.

ACF canonical hook types should be:

```txt
session_start
user_prompt_submit
pre_tool
permission_request
post_tool
stop
```

Target adapters map these to native names where possible.

### Your answer

agreed

---

## Q4 — Should hook entries have `name` and `description`?

### Context

Even if hooks are grouped by event type, each handler/matcher still needs diagnostic identity. Native systems often treat handlers as anonymous command entries, but ACF should be easier to validate, explain, and debug. Without names, diagnostics become “third hook under pre_tool failed,” which is bad for users and agents.

However, hook names should identify handler entries inside a hook type, not imply the hook itself is an arbitrary capability unit.

### Options

1. Every hook handler entry requires `name` and `description`.
2. `name` is required, `description` optional.
3. Hook handler entries are anonymous.

### Recommendation

Use **option 2**: `name` required, `description` optional but recommended.

Example:

```yaml
pre_tool:
  - name: block-dangerous-shell
    description: Block destructive shell commands before execution.
    match:
      operation: shell
    run:
      command: ./pre-tool/block-dangerous-shell.ts
```

`name` follows the same slug regex as other capability names. It is stable diagnostic identity, not a separate capability family shape. `description` is optional but recommended for review/UI surfaces; omit it when the `name` is self-explanatory.

### Your answer

Accepted: name required, description optional.

---

## Q5 — How should matching/filtering work inside each hook type?

### Context

Claude/Codex have a `matcher` string, often matching native tool names or session start sources. Claude also has `if` permission-rule filters. OpenCode and Pi let hook code inspect event payloads directly. ACF cannot use native tool names as portable matchers.

The instruction design already settled useful portable pieces: registry-defined `operation`, path globs, plain regex `conditions: string[]`, OR semantics, no regex object/flags for now. Hooks should reuse those ideas where they fit, but not pretend every native matcher is portable.

Clarification (see Q1): hooks are not conditionally activated. The hook event itself is the trigger. `match` is the optional event filter inside an entry: it narrows which event instances the handler sees, similar to Claude's `matcher` + `if`. Filter fields are ANDed inside one `match`; `conditions` are ORed regex; define multiple entries for OR-across-shapes.

### Options

1. One `match` object per hook entry.
2. Multiple `match` objects under `matches: []`.
3. Native string matcher only.

### Recommendation

Use **option 1** first:

```yaml
match:
  operation: file_write
  paths: ["**/*.ts"]
  conditions:
    - "globalThis\\.fetch\\s*="
```

Rules:

- `operation` is singular and registry-defined.
- `paths` are package/workspace-relative forward-slash globs, case-sensitive by default.
- `conditions` are plain regex pattern strings, ORed.
- Fields inside one `match` object are ANDed.
- If multiple alternatives are needed, define multiple entries with the same `run` path.

This avoids needing nested `anyOf` immediately.

### Your answer

Accepted: `match` is event filter, not conditional activation.

---

## Q6 — Which hook types require a matcher?

### Context

Native hook systems often allow broad hooks that run for every event. But ACF should avoid surprising expensive behavior. Some hook types are naturally broad (`session_start`, `stop`), while tool hooks are often too broad unless scoped by operation/path/condition.

We need decide whether a bare `pre_tool` is valid.

### Options

1. All hook entries require `match`.
2. Tool/permission hooks require `match`; session/prompt/stop hooks may omit it.
3. `match` is always optional.

### Recommendation

Use **option 2**.

- `pre_tool`, `post_tool`, and `permission_request` require a non-empty `match` (at least one of `operation`, `paths`, `conditions`).
- `session_start`, `user_prompt_submit`, `stop`, and `pre_compact` may omit `match` because their event itself is already narrow.

If an author wants "all tool calls", they must spell it explicitly with the registry-defined wildcard:

```yaml
match:
  operation: any
```

where `any` is a registry-defined operation alias meaning "any operation". A bare `pre_tool` entry with no `match` is a validation error. This avoids surprising broad hooks and is consistent with hosts that recommend matcher-on-tool-events.

### Your answer

Accepted: `pre_tool`/`post_tool`/`permission_request` require non-empty `match`; lifecycle hooks may omit it; explicit `operation: any` spells "all tool calls".

---

## Q7 — What action forms should canonical hooks support?

### Context

Claude hooks can be command, HTTP, MCP tool, prompt, or agent hooks. Codex currently focuses on command hooks, with prompt/agent parsed but skipped in some docs. OpenCode/Pi use JS/TS plugin functions. ACF should not copy every handler type into canonical source at once, and should avoid inline shell strings as the portable default.

The action should be simple enough to emit to command-hook systems and implement in a future runner.

### Options

1. Only `run: <path>` script references are canonical.
2. Canonical supports `run`, `http`, `mcp`, `prompt`, and `agent` immediately.
3. Canonical supports inline shell strings.

### Recommendation

Use **option 1** for canonical hooks, with an exec/shell duality borrowed from Claude Code so hooks can be either safe argv invocations or shell strings.

`run` is an object with the following fields:

- `command` (required): either an executable name/path or, in shell form, a full shell command line.
- `args` (optional, list): when present, exec form. `command` is resolved as an executable and spawned directly with `args` as the argument vector. No shell, no quoting, no tokenization. Each entry is one argv token exactly as written.
- `shell` (optional, enum `bash | powershell`): when present, shell form. `command` is passed to the named shell. Pipes, redirects, `&&`, globs, and variable expansion work. Mutually exclusive with `args`.
- If neither `args` nor `shell` is set, the default is exec form with empty argv; a bare `command` is treated as a single executable path/name.

Exec form (safe argv, no shell):

```yaml
pre_tool:
  - name: typecheck
    match:
      operation: file_write
      paths: ["**/*.ts"]
    run:
      command: tsx
      args: ["./pre-tool/typecheck.ts"]
```

Shell form (pipes, redirects):

```yaml
pre_tool:
  - name: lint
    match:
      operation: file_write
    run:
      command: "pnpm exec eslint --quiet | tee .lint.log"
      shell: bash
```

Bare script path (exec form, no args):

```yaml
pre_tool:
  - name: block-dangerous-shell
    match:
      operation: shell
    run:
      command: ./pre-tool/block-dangerous-shell.ts
```

Path placeholders are substituted into `command` and into each `args` element before spawning:

- `${ACF_PACKAGE_DIR}` — the ACF package root.
- `${ACF_HOOK_DIR}` — the directory containing `hooks/hooks.yml`.

Cwd defaults to the package root so behavior is deterministic across hosts.

Stdin is the event payload as JSON (taxonomy-defined fields; native-only fields under `targets.<target>` extension data). Exit code, stdout, and decision JSON contract is owned by the adapter/runner; ACF declares portable `effect` (see Q9/Q10) rather than fixing a universal wire protocol now.

Target-specific non-command handler types (HTTP, MCP tool, prompt, agent) go under `targets.<target>` if needed:

```yaml
targets:
  claude:
    type: http
    url: http://localhost:8787/pre-tool
```

Do not make inline shell strings canonical at the top level (no string-shorthand `run:`); always use the object form.

### Your answer

Accepted: run is an object with command + optional args + optional shell, mirroring Claude exec/shell duality.

---

## Q8 — Where are hook action paths resolved from?

### Context

Hooks live in `hooks/hooks.yml`. Hook scripts will often live under `hooks/` too. We rejected a canonical top-level `lib/`/`src/`; support files should live near capabilities or be explicitly referenced. Authors should be able to write `./pre-tool/foo.ts` from the hook file directory.

Path resolution must be deterministic for adapters and package import tools.

This applies to relative paths appearing in `run.command` and `run.args`. Path placeholders `${ACF_PACKAGE_DIR}` and `${ACF_HOOK_DIR}` are always available and resolve to the package root and the hook file directory respectively.

### Options

1. Resolve `run` paths relative to package root.
2. Resolve `run` paths relative to the `hooks/hooks.yml` directory.
3. Require explicit prefixes for every path.

### Recommendation

Use **option 2**:

```txt
hooks/
  hooks.yml
  pre-tool/
    block-dangerous-shell.ts
```

```yaml
pre_tool:
  - name: block-dangerous-shell
    description: Block destructive shell commands.
    match:
      operation: shell
    run:
      command: ./pre-tool/block-dangerous-shell.ts
```

Portable paths are relative, forward-slash paths. Absolute paths are invalid in ACF source. Authors may also use `${ACF_HOOK_DIR}/...` or `${ACF_PACKAGE_DIR}/...` for clarity in cross-package references.

### Your answer


---

## Q9 — What can canonical hook handlers return?

### Context

This is the most runtime-like part. Claude, Codex, OpenCode, and Pi differ substantially:

- pre-tool can block/deny before execution,
- permission hooks can allow/deny/ask,
- post-tool can add feedback or sometimes replace output,
- prompt hooks can block or add context,
- stop hooks can continue the agent,
- some systems allow mutating tool args or compaction prompts.

ACF should not define a full universal JSON result protocol yet. But it can define portable intent categories that adapters/runners map or diagnose.

### Options

1. Define a complete cross-target hook result JSON protocol now.
2. Define per-hook-type portable effects at a high level: block, allow, add_context, continue, observe.
3. Leave all hook outputs target-specific.

### Recommendation

Use **option 2**.

Each canonical hook entry may declare its declared *intent* via an `effect` field. The effect tells the adapter/runner which native decision channel to wire and which return semantics to map. ACF does not define a universal stdout/JSON wire protocol; that contract is owned by the adapter or runner.

Initial effect vocabulary:

```txt
observe         # side-effect / logging only, no decision channel
block           # may cancel/refuse the event (pre_tool, user_prompt_submit, permission_request)
add_context     # may inject additional context into the conversation/session
continue        # may instruct the runtime to continue past a stop boundary
block_result    # may replace or annotate a completed operation result (post_tool)
decide          # may emit a host-native decision payload (used for permission_request: allow|deny|ask)
```

Rules:

- `effect` is required for canonical hook entries.
- An entry may declare exactly one `effect`. Multi-effect handlers are out of scope; define separate entries.
- Allowed effects per hook type are restricted by the support matrix in Q10.
- If the selected target cannot map an effect for a given hook type, emission must produce a lossiness diagnostic.
- Adapters translate `effect` into native decision wire format (Claude `permissionDecision`, exit code 2, `decision: "block"`, OpenCode `throw`, Pi `{ block, reason }` return, etc.).
- The handler's actual return value semantics (regex output, JSON body, exit codes) belong to the adapter/runner contract, not the ACF source.

Example:

```yaml
pre_tool:
  - name: block-dangerous-shell
    match:
      operation: shell
      conditions:
        - "\\brm\\s+-rf\\b"
    run:
      command: ./pre-tool/block-dangerous-shell.ts
    effect: block
```

### Your answer

Accepted: high-level effect vocabulary, one per entry, allowed set restricted per hook type. `decide` covers permission_request's allow/deny/ask channel.

---

## Q10 — Which effects are valid for each canonical hook type?

### Context

Not every effect makes sense everywhere. `pre_tool` can block before execution. `post_tool` cannot undo the tool side effect, but can add feedback/context or influence continuation. `session_start` is mostly setup/context. `stop` can request continuation in Claude/Codex-like systems.

If ACF allows every effect everywhere, portability diagnostics become weak. If it over-restricts, target-specific power is lost.

### Options

1. ACF defines a support matrix of allowed canonical effects per hook type.
2. Any effect can be declared on any hook type; adapters decide.
3. Effects are target-specific only.

### Recommendation

Use **option 1** with a small matrix. To keep the canonical `effect` vocabulary stable, permission decisions reuse a single canonical `decide` effect; the host-native `allow`/`deny`/`ask` payload is owned by the adapter contract and may be expressed via the handler's return.

```txt
session_start:      observe | add_context
user_prompt_submit: observe | block | add_context
pre_tool:           observe | block
permission_request: observe | decide
post_tool:          observe | add_context | block_result
stop:               observe | continue
pre_compact:        observe | add_context
```

Rules:

- An entry's `effect` must be one of the allowed values for its hook type. Otherwise validation fails.
- Targets that cannot honor an effect for a given hook type produce a lossiness diagnostic during emission.
- `block_result` does not undo the side effect of an already-executed tool; it modifies what the assistant sees as the operation result.
- `decide` for `permission_request` means the handler may emit an allow/deny/ask decision in its native return; ACF does not define the wire format yet.

### Your answer

Accepted matrix; `decide` replaces explicit allow|deny|ask in canonical effect vocabulary; `pre_compact` allows observe|add_context.

---

## Q11 — Should `permission_request` be canonical?

### Context

Claude and Codex both have permission/request approval hooks. OpenCode has permission events (`permission.asked`, `permission.replied`) and a permission model. Pi can implement approval-ish behavior through tool hooks/UI, but the exact semantics differ.

Permission is security-sensitive and tied to host policy. We already avoided canonical agent permissions because it is a rabbit hole. But permission request hooks are a real lifecycle concept in multiple hosts.

### Options

1. Include `permission_request` as a canonical hook type, with only broad allow/deny/ask intent.
2. Keep permission request hooks target-specific for now.
3. Treat permission request as a subtype of `pre_tool`.

### Recommendation

Use **option 1**, but keep it narrow.

Canonical `permission_request` means "a host is asking whether an operation or resource access should be allowed." It uses the standard `match` shape (`operation`, `paths`, `conditions`) over registry-defined operations/resources. Its `effect` is restricted to `observe | decide` (Q10). No full permission policy language is defined in ACF; complex policy stays target-specific.

Example:

```yaml
permission_request:
  - name: deny-prod-shell
    match:
      operation: shell
      conditions:
        - "\\bprod\\b"
    run:
      command: ./permission/deny-prod-shell.ts
    effect: decide
```

### Your answer

Accepted: permission_request canonical but narrow; reuses standard match/registry operations; effect restricted to observe|decide.

---

## Q12 — Should hook order be list order within each event bucket?

### Context

Claude/Codex execute multiple matching hooks, sometimes concurrently depending on handler type/runtime. OpenCode loads plugins in sequence. Pi handler order is registration/load order. Cross-target ordering is not perfectly portable.

ACF still needs deterministic source order and diagnostics. Since hooks are grouped by event bucket, list order is visible and simple.

### Options

1. List order within each hook type is canonical source order.
2. Add `priority` numbers now.
3. Add dependency fields like `before`/`after`.

### Recommendation

Use **option 1**.

Within each hook type, the YAML sequence order is the canonical hook order:

```yaml
pre_tool:
  - name: first-check
    ...
  - name: second-check
    ...
```

Rules:

- ACF source list order is deterministic and is the canonical order.
- Adapters/runners must preserve it when the target supports ordered execution.
- When the target executes hooks concurrently or in undefined order (e.g. some plugin systems), the adapter must emit a lossiness diagnostic noting that ordering is not preserved.
- ACF does not define `priority`, `before`, or `after` fields yet. If real ordering pressure appears later, prefer dependency fields over numeric priorities (less brittle than priority sorts).

### Your answer

Accepted: source list order is canonical; lossiness diagnostic when target cannot preserve.

---

## Q13 — Should hooks have target applicability at entry level?

### Context

Capabilities already may use `only`/`except` for target applicability, and `targets.<target>` for target-specific extension data. Hook entries inside `hooks/hooks.yml` are not Markdown files, but they are still capability declarations. We need decide whether each hook handler entry can be target-scoped.

Unlike instruction trigger blocks, where we rejected trigger-level `only`/`except`, hook entries may need target scope because one package may contain several hook handlers for the same event, only some of which make sense on a target.

### Options

1. Allow `only`/`except` on each hook handler entry.
2. Only allow target applicability at the whole `hooks/hooks.yml` family level.
3. Do not allow hook target applicability; use `targets.<target>` only.

### Recommendation

Use **option 1**.

Example:

```yaml
pre_tool:
  - name: block-dangerous-shell
    description: Block destructive shell commands.
    only: [claude, codex]
    match:
      operation: shell
    run:
      command: ./pre-tool/block-dangerous-shell.ts
    effect: block
```

Rules:

- Each hook entry may declare `only: [TargetId, ...]` or `except: [TargetId, ...]`, but not both.
- Target ids are validated by the target registry; unknown ids are diagnostics.
- Applicability filters entries before adapter-specific validation. An entry filtered out by `except` produces no diagnostics for unsupported target features.
- Applicability is separate from `targets.<target>` extension data: `only`/`except` decides whether the entry exists for the target, `targets.<target>` adds native-only fields to the entry.

Rationale: hook entries are discrete declarations. Entry-level applicability is clearer than burying target scope inside extension data and aligns with capability-level `only`/`except` already settled.

### Your answer

Accepted: entry-level only/except mirrors capability-level rules; separate from targets.<target> extension data.

---

## Q14 — How should target-native hook events be represented?

### Context

Targets have many events beyond the initial ACF core. Claude has `PreCompact`, `InstructionsLoaded`, `FileChanged`, `WorktreeCreate`, etc. OpenCode has `session.compacted`, `file.edited`, `shell.env`, TUI events, and more. Pi has `session.compacting`, `before_agent_start`, `context`, and others.

ACF should allow target-specific native power without making those native event names portable.

### Options

1. Native event names are allowed only under `targets.<target>` extension data.
2. Native event names can be top-level keys next to canonical hook types.
3. Native event names are forbidden entirely.

### Recommendation

Use **option 1**.

Canonical hook types live at top level under `hooks/hooks.yml`. Target-native hook events are allowed only under the family-level `targets.<target>` extension at the same file, validated by the target registry's hook extension schema.

Canonical:

```yaml
pre_tool:
  - name: block-dangerous-shell
    match:
      operation: shell
    run:
      command: ./pre-tool/block-dangerous-shell.ts
    effect: block
```

Target-specific native-only hooks:

```yaml
targets:
  claude:
    hooks:
      InstructionsLoaded:
        - run:
            command: ./claude/post-load.sh
      FileChanged:
        - run:
            command: ./claude/file-changed.sh
  opencode:
    hooks:
      "file.edited":
        - run:
            command: ./opencode/on-file-edited.ts
```

Rules:

- Native-only event names are non-portable. They are validated by the target's hook extension schema, not by ACF core.
- Native-only hooks reuse the canonical entry fields where the schema accepts them (`name`, `description`, `run`, `effect` where supported); only the event key is non-portable.
- Mixing canonical and target-native events for the *same* effect is allowed; ACF does not deduplicate them.

### Your answer

Accepted: native event names only under targets.<target>.hooks; entries reuse canonical entry shape.

---

## Q15 — Should hook runner design be shared with instruction trigger runtime?

### Context

Triggered instructions and hooks overlap operationally: both observe runtime events, match operations/resources/text, may inject context or block/interrupt, need diagnostics/provenance, and may be implemented by a generic runner for hosts without native support.

But ACF must not become a full runtime protocol. The package format can define source slots and intent; a runner/SDK or sibling runtime taxonomy can define execution payloads and mappings.

### Options

1. Define a universal hook/instruction runner in the ACF spec now.
2. Keep hooks and instructions totally separate.
3. Record the shared boundary and leave runner/taxonomy as implementation or sibling-spec work.

### Recommendation

Use **option 3**.

ACF standardizes:

- the source shape of hook entries and instruction triggers,
- the registry-defined operation/event/permission/message-surface vocabulary used in their selectors,
- diagnostic and lossiness behavior for unsupported selectors or effects.

The execution layer (wire protocol between handler processes and the host, decision payload shape, stream interception model, debounce/repeat enforcement, scope evaluation algorithm) is intentionally not in ACF spec yet. A future hook runner / instruction runtime, possibly a sibling spec, can implement both using the same taxonomy.

Rules:

- ACF documents which selectors and effects are portable and how to diagnose unsupported ones.
- ACF does not document handler stdin/stdout/exit-code/JSON wire formats. Adapters/runners define them.
- When a target ships its own runner (e.g. Claude Code, Codex, OpenCode), the adapter binds ACF source to the host's wire contract.
- When no native runner exists, a future generic runner can implement the same source.

### Your answer

Accepted: ACF defines source/registry/diagnostics, not wire protocol; future runner deferred.
