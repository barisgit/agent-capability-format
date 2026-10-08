import "@caplet/adapters";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { type Diagnostic, targetIds, targetMap } from "@caplet/core";
import { readLockfile } from "@caplet/installer";
import { type ArgsDef, defineCommand } from "citty";
import { readCwd, readScope } from "../internal/args";
import { runCommandSafely } from "../internal/command";
import { printJson, readJson } from "../internal/json";
import { exitCodeForDiagnostics, finishWithDiagnostics, reporter } from "../internal/output";
import { resolveScopeRoots } from "../internal/scopes";
import { specToCittyArgs } from "../internal/spec";

export const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "check caplet environment and setup" },
  args: specToCittyArgs("doctor") as ArgsDef,
  async run(context) {
    await runCommandSafely(context.args, async () => {
      const diagnostics: Diagnostic[] = [];
      const checks: DoctorCheck[] = [];
      await checkGit(checks, diagnostics);
      await checkAgentsReadable(checks, diagnostics);
      checkTargets(checks, diagnostics);
      await checkLockfiles(context.args, checks, diagnostics);
      if (readJson(context.args)) {
        const code = exitCodeForDiagnostics(diagnostics, context.args);
        printJson("doctor", code === 0, diagnostics, {
          checks: checks.map((check) => ({
            section: check.section,
            status: check.status,
            message: check.message,
          })),
        });
        process.exitCode = code;
        return;
      }
      const out = reporter(context.args);
      const code = finishWithDiagnostics(diagnostics, context.args);
      for (const section of ["Environment", "Targets", "Lockfiles"] as const) {
        if (section !== "Environment") out.log("");
        out.section(section);
        for (const check of checks.filter((item) => item.section === section)) {
          out.status(check.status, check.message);
        }
      }
      out.log("");
      const passed = checks.filter((check) => check.status === "pass").length;
      if (code === 0) out.done(`${passed} ${passed === 1 ? "check" : "checks"} passed`);
      process.exitCode = code;
    });
  },
});

type DoctorCheck = {
  section: "Environment" | "Targets" | "Lockfiles";
  status: "pass" | "warn" | "fail";
  message: string;
};

async function checkGit(checks: DoctorCheck[], diagnostics: Diagnostic[]): Promise<void> {
  const proc = Bun.spawn(["git", "--version"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code === 0) {
    checks.push({ section: "Environment", status: "pass", message: "Git available" });
    return;
  }
  diagnostics.push({
    severity: "error",
    code: "acf.doctor.git-missing",
    message: "git is not available",
  });
  checks.push({ section: "Environment", status: "fail", message: "Git unavailable" });
}

async function checkAgentsReadable(
  checks: DoctorCheck[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const agentsDir = path.join(homedir(), ".agents");
  try {
    await readdir(agentsDir);
    checks.push({
      section: "Environment",
      status: "pass",
      message: `Agents directory readable (${agentsDir})`,
    });
  } catch (error) {
    const severity = isErrno(error, "ENOENT") ? "warn" : "error";
    diagnostics.push({
      severity,
      code: "acf.doctor.agents-unreadable",
      message: `${agentsDir} is not readable`,
      path: agentsDir,
    });
    checks.push({
      section: "Environment",
      status: severity === "warn" ? "warn" : "fail",
      message: `Agents directory unreadable (${agentsDir})`,
    });
  }
}

function checkTargets(checks: DoctorCheck[], diagnostics: Diagnostic[]): void {
  for (const targetId of targetIds) {
    const target = targetMap[targetId];
    if (target?.adapter !== undefined) {
      checks.push({
        section: "Targets",
        status: "pass",
        message: `${target.displayName} adapter registered`,
      });
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "acf.doctor.target-unregistered",
      message: `target adapter not registered: ${targetId}`,
      targetId,
    });
    checks.push({
      section: "Targets",
      status: "fail",
      message: `${target?.displayName ?? targetId} adapter unavailable`,
    });
  }
}

async function checkLockfiles(
  args: Record<string, unknown>,
  checks: DoctorCheck[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const cwd = readCwd(args);
  for (const root of await resolveScopeRoots(readScope(args), cwd)) {
    try {
      await readLockfile(root.lockPath);
      checks.push({
        section: "Lockfiles",
        status: "pass",
        message: `${capitalize(root.scope)} lockfile`,
      });
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "acf.doctor.lockfile-invalid",
        message: error instanceof Error ? error.message : "invalid lockfile",
        path: root.lockPath,
      });
      checks.push({
        section: "Lockfiles",
        status: "fail",
        message: `${capitalize(root.scope)} lockfile invalid`,
      });
    }
  }
}

function isErrno(error: unknown, code: string): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
