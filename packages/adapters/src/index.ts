/**
 * Every target adapter. Importing this module registers each one with `@caplet/core`'s adapter
 * registry, in the order listed.
 */
import { claudeAdapter } from "./claude/index.js";
import { codexAdapter } from "./codex/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { opencodeAdapter } from "./opencode/index.js";
import { piAdapter } from "./pi/index.js";

export { claudeAdapter, codexAdapter, cursorAdapter, opencodeAdapter, piAdapter };

/** The adapters by target id. */
export const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
  pi: piAdapter,
  opencode: opencodeAdapter,
  cursor: cursorAdapter,
};
