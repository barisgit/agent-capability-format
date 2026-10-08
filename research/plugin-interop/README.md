# Plugin interop research

Field-level research backing the plugin-interop design for ACF/caplet: per-tool inventories of every native capability type (skills, instructions/rules, agents, commands, hooks, MCP, other native types), permissions and trust, and packaging/install/scopes, so the canonical model and per-target writers rest on documented contracts rather than assumptions.

Snapshot date: 2026-10-01. Each inventory states its own evidence baseline and marks post-snapshot or unpinned sources.

## Tool inventories

- [agent-plugins](tools/agent-plugins.md) - Agent Plugins 1.0 open standard: ok
- [agent-skills](tools/agent-skills.md) - Agent Skills open standard + AGENTS.md + MCP Bundles: ok
- [claude-code](tools/claude-code.md) - Anthropic Claude Code: ok
- [codex](tools/codex.md) - OpenAI Codex (CLI, IDE, desktop): ok
- [copilot](tools/copilot.md) - GitHub Copilot (CLI, app, coding agent): ok
- [vscode](tools/vscode.md) - VS Code agent customization: ok
- [cursor](tools/cursor.md) - Cursor: ok
- [gemini-cli](tools/gemini-cli.md) - Google Gemini CLI: ok
- [opencode](tools/opencode.md) - OpenCode: ok
- [amp](tools/amp.md) - Amp (Sourcegraph): ok
- [windsurf](tools/windsurf.md) - Windsurf / Devin Desktop: ok
- [cline-roo](tools/cline-roo.md) - Cline and Roo Code: ok
- [goose-kiro](tools/goose-kiro.md) - Goose and Kiro: ok
- [pi](tools/pi.md) - Pi coding agent (the harness this project targets; local): ok
- [lume](tools/lume.md) - Lume (the user's own agent runtime; local): ok

## Facets

- [skills](facets/skills.md) - `SKILL.md` frontmatter, invocation, bundled files, discovery roots, plugin packaging of skills
- [instructions](facets/instructions.md) - `AGENTS.md`/`CLAUDE.md`, rules files, activation modes, nesting and precedence
- [agents](facets/agents.md) - subagent and custom-agent definitions, tool availability, delegation, scopes
- [commands](facets/commands.md) - slash commands and prompt files, arguments and placeholders, shell/file interpolation
- [hooks](facets/hooks.md) - lifecycle events, matchers, handler kinds, wire protocol, effects and failure behavior
- [mcp](facets/mcp.md) - MCP server fields, transports, variable expansion incl. plugin-root variables, scopes
- [permissions](facets/permissions.md) - permission rules, tool availability, trust prompts, sandboxing, managed policy
- [extras](facets/extras.md) - remaining native types: LSP, themes, install-time options, providers, code modules, one-tool components
- [distribution](facets/distribution.md) - package manifests, marketplaces, install/enable mechanics, scopes, lock and provenance

## Advice

- [advice-core-vs-extras](advice-core-vs-extras.md) - pre-research critique of the core-vs-extras split and the first-slice boundary
- [advice](advice.md) - post-research critiques through five lenses (simplicity, standards, implementation, security, product), verbatim
