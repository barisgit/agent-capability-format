import "@acf/adapters";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { defineCommand } from "citty";
import { targetIds, targetMap, type Diagnostic } from "@acf/core";
import { readLockfile } from "@acf/installer";
import { globalArgs, readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";

export const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "check caplet environment and setup" },
  args: globalArgs,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const diagnostics: Diagnostic[] = [];
      const lines: string[] = [];
      await checkGit(lines, diagnostics);
      await checkAgentsReadable(lines, diagnostics);
      checkTargets(lines, diagnostics);
      await checkLockfiles(context.args, lines, diagnostics);
      const code = finishWithDiagnostics(diagnostics, context.args);
      const out = reporter(context.args);
      for (const line of lines) out.log(line);
      process.exitCode = code;
    });
  },
});

async function checkGit(lines: string[], diagnostics: Diagnostic[]): Promise<void> {
  const proc = Bun.spawn(["git", "--version"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code === 0) {
    lines.push("pass git available");
    return;
  }
  diagnostics.push({ severity: "error", code: "acf.doctor.git-missing", message: "git is not available" });
  lines.push("fail git unavailable");
}

async function checkAgentsReadable(lines: string[], diagnostics: Diagnostic[]): Promise<void> {
  const agentsDir = path.join(homedir(), ".agents");
  try {
    await readdir(agentsDir);
    lines.push(`pass readable ${agentsDir}`);
  } catch (error) {
    const severity = isErrno(error, "ENOENT") ? "warn" : "error";
    diagnostics.push({
      severity,
      code: "acf.doctor.agents-unreadable",
      message: `${agentsDir} is not readable`,
      path: agentsDir,
    });
    lines.push(`${severity === "warn" ? "warn" : "fail"} unreadable ${agentsDir}`);
  }
}

function checkTargets(lines: string[], diagnostics: Diagnostic[]): void {
  for (const targetId of targetIds) {
    const target = targetMap[targetId];
    if (target?.adapter !== undefined) {
      lines.push(`pass target ${targetId}`);
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "acf.doctor.target-unregistered",
      message: `target adapter not registered: ${targetId}`,
      targetId,
    });
    lines.push(`fail target ${targetId}`);
  }
}

async function checkLockfiles(
  args: Record<string, unknown>,
  lines: string[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const cwd = readCwd(args);
  for (const root of await resolveScopeRoots(readScope(args), cwd)) {
    try {
      await readLockfile(root.lockPath);
      lines.push(`pass lockfile ${root.scope}`);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "acf.doctor.lockfile-invalid",
        message: error instanceof Error ? error.message : "invalid lockfile",
        path: root.lockPath,
      });
      lines.push(`fail lockfile ${root.scope}`);
    }
  }
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
