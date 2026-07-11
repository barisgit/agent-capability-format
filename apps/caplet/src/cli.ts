import { defineCommand } from "citty";
import { addCommand } from "./commands/add";
import { applyCommand } from "./commands/apply";
import { checkCommand } from "./commands/check";
import { doctorCommand } from "./commands/doctor";
import { initCommand } from "./commands/init";
import { listCommand } from "./commands/list";
import { removeCommand } from "./commands/remove";
import { showCommand } from "./commands/show";
import { statusCommand } from "./commands/status";
import { updateCommand } from "./commands/update";

export const rootCommand = defineCommand({
  meta: {
    name: "caplet",
    version: "0.2.0",
    description: "install agent capabilities and sync them into your AI tools",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    remove: removeCommand,
    update: updateCommand,
    apply: applyCommand,
    list: listCommand,
    show: showCommand,
    check: checkCommand,
    doctor: doctorCommand,
    status: statusCommand,
  },
});

export type AliasRewrite = { argv: string[]; notice?: string };

export function rewriteAlias(argv: string[]): AliasRewrite {
  const [command, ...rest] = argv;
  switch (command) {
    case "ls":
      return { argv: ["list", ...rest] };
    case "inspect":
      return {
        argv: ["show", ...rest],
        notice: "caplet inspect is deprecated; use caplet show",
      };
    case "diff":
      return {
        argv: ["apply", "--dry-run", ...rest],
        notice: "caplet diff is deprecated; use caplet apply --dry-run",
      };
    case "emit": {
      const args = rest.filter((token) => token !== "--dry-run");
      const dryRun = rest.includes("--dry-run");
      return {
        argv: ["apply", "--offline", ...(dryRun ? ["--dry-run"] : []), ...args],
        notice: "caplet emit is deprecated; use caplet apply",
      };
    }
    case "fetch": {
      const args = rest.filter(
        (token) =>
          !token.startsWith("--mode") && token !== "auto" && token !== "force" && token !== "never",
      );
      return {
        argv: ["update", "--no-apply", ...args],
        notice:
          "caplet fetch is deprecated; apply fetches automatically (running caplet update --no-apply)",
      };
    }
    default:
      return { argv };
  }
}
