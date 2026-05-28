import "./claude";
import "./codex";
import "./cursor";
import "./opencode";
import "./pi";

export { claudeAdapter } from "./claude";
export { codexAdapter } from "./codex";
export { cursorAdapter } from "./cursor";
export { opencodeAdapter } from "./opencode";
export { piAdapter } from "./pi";

import { claudeAdapter } from "./claude";
import { codexAdapter } from "./codex";
import { cursorAdapter } from "./cursor";
import { opencodeAdapter } from "./opencode";
import { piAdapter } from "./pi";

export const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
  pi: piAdapter,
  opencode: opencodeAdapter,
  cursor: cursorAdapter,
};
