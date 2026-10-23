/** Environment paths shared by disposable test and package-smoke homes. */
import path from "node:path";

/** Redirects host configuration and XDG storage into `home`; callers create and own its lifetime. */
export function isolatedHomeEnv(home: string): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
  };
}
