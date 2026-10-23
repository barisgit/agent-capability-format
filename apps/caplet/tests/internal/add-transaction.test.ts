import { expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scopeRoot } from "@caplet/core";
import { withInstallerRollback } from "../../src/internal/add-transaction";
import type { ApplicablePlan } from "../../src/internal/workflow";
import { cleanup, makeScope, readText, writeText } from "../helpers";

// Linux provides a writable tmpfs for exercising EXDEV without mounts or root privileges.
const separateFilesystem =
  existsSync("/dev/shm") && statSync("/dev/shm").dev !== statSync(tmpdir()).dev;

test.skipIf(!separateFilesystem)("ownership rollback works across filesystems", async () => {
  const scope = await makeScope();
  const installRoot = await mkdtemp("/dev/shm/caplet-ownership-");
  try {
    const sidecar = path.join(installRoot, ".acf-managed.json");
    const before = '{"acf":1,"managed":[]}\n';
    await writeText(sidecar, before);
    const plan: ApplicablePlan = {
      cwd: scope.cwd,
      diffs: [],
      claude: [],
      migration: { releases: [], renames: [] },
      staleEntries: [
        {
          installRoot,
          path: "old.md",
          capability: "old",
          owns: [{ kind: "file" }],
          owner: { target: "codex", carrier: "loose" },
        },
      ],
    };
    await withInstallerRollback(
      scopeRoot("project", scope.agentsDir),
      async () => {
        await writeText(sidecar, '{"acf": 1, "managed": []}\n');
        return false;
      },
      plan,
    );
    expect(await readText(sidecar)).toBe(before);
  } finally {
    await rm(installRoot, { recursive: true, force: true });
    await cleanup(scope);
  }
});
