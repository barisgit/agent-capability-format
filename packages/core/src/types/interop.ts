/**
 * Interop contracts shared by the format readers (core/formats), the field-level support
 * registry (core/targets), the writers (adapters) and caplet's plan/apply. A shape change here
 * reaches every one of them.
 */
import type { TargetId } from "./model.js";

/** Source package formats caplet can read (SPEC.md §20, source-format-readers). */
export const sourceFormats = ["acf", "agent-plugins", "claude-plugin", "skills"] as const;
export type SourceFormat = (typeof sourceFormats)[number];

/**
 * Safety class of a field, value condition or native key (capability-model-layers,
 * Safety classes). Only `descriptive` and `granting` may be degraded; `restricting`
 * and `functional` are native, translated or refused. Keys the registry does not
 * know are `unclassified`.
 */
export type SafetyClass = "restricting" | "granting" | "functional" | "descriptive";
export type NativeKeyClass = SafetyClass | "unclassified";

/** How a target receives a capability: a real host plugin package or loose files. */
export type Carrier = "plugin" | "loose";

/** Evidence behind a support cell (capability-model-layers, Recorded equivalence evidence). */
export type CellEvidence = {
  level: "documented" | "verified";
  /** Citation: research inventory section or verified test name. */
  source: string;
  /** Host version for `verified` evidence, e.g. "claude 2.1.97". */
  hostVersion?: string | undefined;
};

/**
 * One cell of the field-level support table: what a writer for one target and
 * carrier does with one core field or value condition.
 */
export type SupportCell =
  | {
      kind: "native";
      /** Native spelling, e.g. "disable-model-invocation: true". */
      spelling: string;
      /** Where the spelling lives when not the obvious file, e.g. "agents/openai.yaml". */
      location?: string | undefined;
      /** Value-domain condition under which the mapping is exact. */
      condition?: string | undefined;
      evidence: CellEvidence;
    }
  | { kind: "translated"; rule: string; evidence: CellEvidence }
  | {
      kind: "degraded";
      loss: string;
      severity: "lossy" | "info" | "warn";
      evidence: CellEvidence;
    }
  | {
      kind: "refused";
      reason: string;
      evidence?: CellEvidence | undefined;
      /**
       * Id of the negative fixture proving nothing is written (required for restricting fields);
       * the fixtures are in apps/caplet/tests/negative-fixtures.test.ts.
       */
      negativeFixture?: string | undefined;
    };

/** Component families covered by the field-level table in this change. */
export type InteropFamily = "skill" | "mcp" | "hook" | "package";

/**
 * Support declaration for one core field or value condition, e.g.
 * `skill.invocation.model=false` or `mcp.cwd`.
 */
export type FieldSupport = {
  family: InteropFamily;
  /** Stable id: `<family>.<field path>` plus `=<value>` for a value condition. */
  field: string;
  class: SafetyClass;
  cells: Partial<Record<TargetId, Partial<Record<Carrier, SupportCell>>>>;
};

/**
 * A native key known to the registry for one target, attachment point and spelling.
 * `generatedFrom` marks keys a writer derives from a core field (an extra with that key
 * is `acf.extras.conflict`); `pending` names the future core field (`acf.core.pending`).
 * `class` holds for every value except those `valueClasses` lists with a distinct effect,
 * such as Codex `enabled: false`, which restricts. Read the class of a value through
 * `nativeKeyClass`.
 */
export type NativeKeyInfo = {
  target: TargetId;
  family: InteropFamily;
  key: string;
  class: SafetyClass;
  valueClasses?: readonly { value: boolean; class: SafetyClass }[] | undefined;
  generatedFrom?: string | undefined;
  pending?: { coreField: string } | undefined;
};

/**
 * One file under a capability's `native/<target>/` tree (capability-model-layers, File-level
 * native extras). A plugin-carrier writer of `target` copies it byte- and mode-exact from
 * `<capability root>/native/<target>/<path>` to `<path>` inside the generated package; every
 * other writer drops the tree with `acf.extras.dropped`. Read through `nativeFiles` and
 * `nativeFileTargets` in the extras module.
 */
export type NativeFileExtra = {
  target: TargetId;
  /** POSIX path relative to `native/<target>/`, which is also its path inside the package. */
  path: string;
  executable: boolean;
};

/** Provenance of a capability read through a format reader. */
export type CapabilitySource = {
  format: SourceFormat;
  /** e.g. "1.0" for Agent Plugins; absent when the format has no version. */
  formatVersion?: string | undefined;
  /** Selected package root relative to the source root, POSIX separators, "." for the root. */
  path: string;
  /** Absolute path of the immutable materialized snapshot of the package root. */
  snapshotRoot: string;
  /**
   * The package as its reader projected it, before `rename`, facet selection and applicability:
   * the projected skill and MCP server names (sorted) and the native remainder as read. Writers
   * compare it, and `renamedFrom`, with the capability they receive to tell an unchanged package,
   * which they write losslessly, from a transformed one. Absent for native ACF.
   */
  projected?:
    | {
        skills: string[];
        /**
         * Package-relative POSIX directories of the projected skills (sorted), so a writer that
         * regenerates skills leaves out exactly the directories of skills it regenerated or
         * selection removed, and copies any other directory holding a `SKILL.md`.
         */
        skillDirs: string[];
        servers: string[];
        remainder: NativeRemainderComponent[];
        /**
         * True when the reader left out a component it could not load
         * (`acf.source.component-invalid`, design D27.4). The package then differs from what its
         * host would read, so a writer never copies it unchanged.
         */
        incomplete?: true | undefined;
      }
    | undefined;
  /**
   * The source manifest's package name when the entry's `rename` changed it; absent otherwise.
   * Preserved native files may still reference this name.
   */
  renamedFrom?: string | undefined;
};

/** Kinds of foreign components a reader preserves without projecting them. */
export type NativeRemainderKind =
  | "agent"
  | "command"
  | "hook"
  | "output-style"
  | "workflow"
  | "lsp-server"
  | "monitor"
  | "bin"
  | "settings"
  | "user-config"
  | "channel"
  | "dependencies"
  | "listing-metadata"
  | "mcp-server"
  | "extension-namespace"
  | "other";

/**
 * A preserved, unprojected component of a foreign package (its native remainder).
 * Writers of the same format copy `paths` unchanged; other targets omit or refuse it
 * according to `class` (capability-model-layers, Component omission).
 */
export type NativeRemainderComponent = {
  /** Format whose dialect the component is written in. */
  format: Exclude<SourceFormat, "acf" | "skills">;
  kind: NativeRemainderKind;
  name: string;
  /** Snapshot-relative POSIX paths belonging to the component (files or directories). */
  paths: string[];
  /** Manifest keys belonging to the component, when it lives (partly) in the manifest. */
  manifestKeys?: string[] | undefined;
  class: SafetyClass;
  /** True when the component executes code (stdio server, hook, LSP, monitor, workflow, bin). */
  executable: boolean;
};
