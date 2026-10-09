/**
 * The `acf.claude.*` diagnostics of a host run. Each builder states what happened to Claude's
 * registration and the recovery a user can take; the callers decide when one applies.
 */
import type { Diagnostic } from "@caplet/core";
import { formatClaudeCommand } from "./commands.js";
import type { ClaudeHostFailure } from "./host.js";
import type { ClaudeScopePlan, PlannedClaudePlugin } from "./plan.js";
import type { ClaudeInstalledPlugin } from "./state.js";

/**
 * The `claude` CLI is missing or does not start; `commands` are the ones left to run. `verb`
 * says whether registration was not `updated` at all or not `finished` after some commands ran.
 */
export function cliUnavailableDiagnostic(
  failure: ClaudeHostFailure,
  commands: string[],
  verb: "updated" | "finished",
): Diagnostic {
  return {
    severity: "warn",
    code: "acf.claude.cli-unavailable",
    targetId: "claude",
    message: `Claude plugin registration was not ${verb}: ${failure.message}. Install Claude Code and re-run \`caplet apply\`, or run:\n${indent(commands)}`,
    data: { commands },
  };
}

/**
 * A list command that failed, could not start, or printed output caplet cannot parse; only a
 * failed command is an error.
 * `ran`: the state was read after commands ran, so registration may have changed.
 */
export function stateReadDiagnostic(
  command: string,
  failure: ClaudeHostFailure,
  ran: boolean,
): Diagnostic {
  const changed = ran
    ? "the Claude commands ran, but their result is unknown"
    : "Claude registration was not changed";
  if (failure.kind === "unavailable") {
    return {
      severity: "warn",
      code: "acf.claude.cli-unavailable",
      targetId: "claude",
      message: `Could not start \`${command}\` (${failure.message}); ${changed}. Install Claude Code and re-run \`caplet apply\`.`,
      data: { commands: [] },
    };
  }
  if (failure.kind === "unreadable") {
    return {
      severity: "warn",
      code: "acf.claude.state-unreadable",
      targetId: "claude",
      message: `Could not read Claude plugin state (${failure.message}); ${changed}. Run \`${command}\` to inspect it, then re-run \`caplet apply\`.`,
      data: { command },
    };
  }
  return {
    severity: "error",
    code: "acf.claude.command-failed",
    targetId: "claude",
    message: `\`${command}\` failed: ${failure.message}; ${changed}. Fix the cause and re-run \`caplet apply\`.`,
    data: { command, skipped: [] },
  };
}

/**
 * A state-changing command that failed: a warning when host policy blocked it, else an error.
 * `skipped` are the commands that waited on it.
 */
export function commandFailedDiagnostic(
  command: string,
  failure: ClaudeHostFailure,
  skipped: string[],
): Diagnostic {
  const skippedText = skipped.length === 0 ? "" : ` Skipped:\n${indent(skipped)}`;
  const policy = failure.kind === "policy-blocked";
  return {
    severity: policy ? "warn" : "error",
    code: policy ? "acf.claude.policy-blocked" : "acf.claude.command-failed",
    targetId: "claude",
    message: policy
      ? `\`${command}\` was blocked by Claude host policy: ${failure.message}. Caplet does not fall back to loose output; ask your administrator to allow the marketplace or set \`targets.claude.carrier: loose\`.${skippedText}`
      : `\`${command}\` failed: ${failure.message}. Fix the cause and re-run \`caplet apply\`.${skippedText}`,
    data: { command, skipped },
  };
}

/**
 * Claude lists `entry` at another version than caplet generated. `pending` is the planned
 * command a dry run or status did not run; without it the commands ran and Claude ignored them.
 */
export function versionMismatchDiagnostic(
  plugin: PlannedClaudePlugin,
  entry: ClaudeInstalledPlugin,
  pending?: string,
): Diagnostic {
  const recovery =
    pending === undefined
      ? "Check that the marketplace directory lists the new version and re-run `caplet apply`."
      : `\`caplet apply\` runs \`${pending}\`.`;
  return {
    severity: "warn",
    code: "acf.claude.version-mismatch",
    targetId: "claude",
    message: `Claude reports \`${plugin.id}\` at version ${entry.version}, expected ${plugin.desiredVersion}, so it still serves the old content. ${recovery}`,
    data: { plugin: plugin.id, reported: entry.version, expected: plugin.desiredVersion },
  };
}

/** `other` installs caplet's marketplace at a Claude scope caplet does not manage. */
export function otherScopeDiagnostic(
  plan: ClaudeScopePlan,
  other: ClaudeInstalledPlugin,
): Diagnostic {
  return {
    severity: "info",
    code: "acf.claude.other-scope",
    targetId: "claude",
    message: `\`${other.id}\` is also installed at Claude ${other.scope} scope; caplet manages only ${plan.claudeScope} scope and leaves it unchanged.`,
    data: { plugin: other.id, scope: other.scope },
  };
}

/**
 * The marketplace stays registered because removing it would change more than caplet's own
 * (`plan.keptBy`). `emptied`: the host state was read, so apply rewrites the catalog with no
 * plugins.
 */
export function marketplaceKeptDiagnostic(plan: ClaudeScopePlan, emptied: boolean): Diagnostic {
  const command = formatClaudeCommand({ op: "marketplace remove", marketplace: plan.marketplace });
  return {
    severity: "warn",
    code: "acf.claude.marketplace-kept",
    targetId: "claude",
    message: `Claude marketplace \`${plan.marketplace}\` stays registered${emptied ? " with an empty catalog" : ""}, because \`${command}\` would also change what caplet does not own:\n${indent(plan.keptBy)}\nRun \`${command}\` yourself to remove it everywhere.`,
    data: { marketplace: plan.marketplace, keptBy: plan.keptBy, command },
  };
}

/**
 * `plugin` moved to loose files but stays installed (action `kept`), because uninstalling it would
 * delete the options and secrets Claude may have saved for it.
 */
export function uninstallHeldDiagnostic(
  plan: ClaudeScopePlan,
  plugin: PlannedClaudePlugin,
): Diagnostic {
  const command = formatClaudeCommand({
    op: "uninstall",
    plugin: plugin.id,
    scope: plan.claudeScope,
    keepData: true,
  });
  return {
    severity: "warn",
    code: "acf.claude.uninstall-held",
    targetId: "claude",
    message: `\`${plugin.id}\` stays installed at Claude ${plan.claudeScope} scope although ${plugin.name} now uses loose Claude files, because uninstalling it would delete the options and secrets Claude may have saved for it. Until it is uninstalled, Claude loads ${plugin.name} from both. To uninstall it and drop them, run \`${command}\`, then re-run \`caplet apply\`.`,
    data: { plugin: plugin.id, command },
  };
}

function indent(lines: string[]): string {
  return lines.map((line) => `  ${line}`).join("\n");
}
