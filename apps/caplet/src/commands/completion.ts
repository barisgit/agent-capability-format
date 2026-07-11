import { defineCommand } from "citty";

const COMMANDS = "init add remove update apply list ls show check doctor status completion";
const SCOPES = "user project";
const TARGETS = "claude codex opencode pi";

const BASH = [
  "_caplet_completions() {",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash parameter expansion
  '  local cur="${COMP_WORDS[COMP_CWORD]}"',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash parameter expansion
  '  local prev="${COMP_WORDS[COMP_CWORD-1]}"',
  '  case "$prev" in',
  `    -s|--scope) COMPREPLY=($(compgen -W "${SCOPES}" -- "$cur")); return ;;`,
  `    -t|--target) COMPREPLY=($(compgen -W "${TARGETS}" -- "$cur")); return ;;`,
  '    completion) COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur")); return ;;',
  "  esac",
  '  if [ "$COMP_CWORD" -eq 1 ]; then',
  `    COMPREPLY=($(compgen -W "${COMMANDS}" -- "$cur"))`,
  "  fi",
  "}",
  "complete -F _caplet_completions caplet",
  "",
].join("\n");

const ZSH = [
  "#compdef caplet",
  "_caplet() {",
  "  local -a commands",
  `  commands=(${COMMANDS})`,
  "  if (( CURRENT == 2 )); then",
  "    _describe 'command' commands",
  "    return",
  "  fi",
  '  case "$words[CURRENT-1]" in',
  `    -s|--scope) _values 'scope' ${SCOPES} ;;`,
  `    -t|--target) _values 'target' ${TARGETS} ;;`,
  "    completion) _values 'shell' bash zsh fish ;;",
  "  esac",
  "}",
  '_caplet "$@"',
  "",
].join("\n");

const FISH = [
  "complete -c caplet -f",
  `complete -c caplet -n __fish_use_subcommand -a "${COMMANDS}"`,
  `complete -c caplet -s s -l scope -x -a "${SCOPES}"`,
  `complete -c caplet -s t -l target -x -a "${TARGETS}"`,
  'complete -c caplet -n "__fish_seen_subcommand_from completion" -x -a "bash zsh fish"',
  "",
].join("\n");

const SCRIPTS: Record<string, string> = { bash: BASH, zsh: ZSH, fish: FISH };

export const completionCommand = defineCommand({
  meta: { name: "completion", description: "print shell completions (bash, zsh, fish)" },
  args: {
    shell: { type: "positional", description: "bash, zsh, or fish", required: true },
  },
  run(context) {
    const script = SCRIPTS[String(context.args.shell)];
    if (script === undefined) {
      process.stderr.write(
        `unsupported shell: ${String(context.args.shell)} (expected bash, zsh, or fish)\n`,
      );
      process.exitCode = 2;
      return;
    }
    process.stdout.write(script);
  },
});
