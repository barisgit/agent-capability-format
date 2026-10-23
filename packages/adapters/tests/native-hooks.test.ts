import { expect, test } from "bun:test";
import {
  type AcfCapability,
  applyApplicability,
  capabilityCarrier,
  readCapability,
} from "@caplet/core";
import { adapters } from "../src";
import { emitModel } from "./util/model";
import { withTempPackage } from "./util/temp-package";

async function readHooksCapability(hooksYml: string): Promise<AcfCapability> {
  const files = { "acf.yml": "acf: 1\nname: demo\nversion: 1.0.0\n", "hooks/hooks.yml": hooksYml };
  const capability = await withTempPackage("acf-native-hooks-", files, (root) =>
    readCapability(root, "project", { kind: "local", directory: root }),
  );
  expect(capability.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return capability;
}

for (const [target, adapter] of Object.entries(adapters)) {
  for (const effect of ["observe", "block", "decide"] as const) {
    test(`${target} refuses canonical ${effect} hooks rather than writing inert or weaker handlers`, async () => {
      const capability = await readHooksCapability(
        `${effect === "decide" ? "permission_request" : "pre_tool"}:\n  - name: guard\n    effect: ${effect}\n    match:\n      operation: shell\n    run:\n      command: ./guard.sh\n`,
      );
      const result = await emitModel(adapter, capability, `/project/.${target}`);
      expect(result.diffs).toEqual([]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "acf.support.refused",
          targetId: target,
          family: "hook",
          data: expect.objectContaining({
            component: "guard",
            source: "hook.run",
            outcome: "blocked",
            consequence: expect.stringContaining("not installed"),
            recovery: expect.stringContaining("exclude"),
          }),
        }),
      );
      expect(result.diagnostics.some((d) => d.message.includes("emitted as observe"))).toBe(false);
    });
  }

  test(`${target} also refuses ACF records naming native events, only on their target`, async () => {
    const capability = await readHooksCapability(
      `targets:\n  ${target}:\n    hooks:\n      NativeEvent:\n        - name: native-handler\n          effect: observe\n          run:\n            command: ./handler.sh\n`,
    );
    const applicable = applyApplicability(capability, target);
    if (applicable === null) throw new Error(`demo does not apply to ${target}`);
    const result = await emitModel(adapter, applicable, `/project/.${target}`);
    expect(result.diffs).toEqual([]);
    expect(result.diagnostics.filter((d) => d.code === "acf.support.refused")).toHaveLength(1);
    if (target === "claude") expect(capabilityCarrier(applicable, target)).toBe("loose");
    for (const other of Object.keys(adapters).filter((id) => id !== target)) {
      expect(applyApplicability(capability, other)?.hooks?.native).toBeUndefined();
    }
  });
}
