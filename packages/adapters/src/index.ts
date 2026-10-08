import "./claude/index.js";
import "./codex/index.js";
import "./cursor/index.js";
import "./opencode/index.js";
import "./pi/index.js";

export { claudeAdapter } from "./claude/index.js";
export { codexAdapter } from "./codex/index.js";
export { cursorAdapter } from "./cursor/index.js";
export { opencodeAdapter } from "./opencode/index.js";
export { piAdapter } from "./pi/index.js";

import { claudeAdapter } from "./claude/index.js";
import { codexAdapter } from "./codex/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { opencodeAdapter } from "./opencode/index.js";
import { piAdapter } from "./pi/index.js";

export const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
  pi: piAdapter,
  opencode: opencodeAdapter,
  cursor: cursorAdapter,
};
