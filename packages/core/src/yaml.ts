import { parseDocument, stringify } from "yaml";
import { assertNoProtoKey } from "./utils/proto-key.js";

/** Parses one YAML document; throws on a syntax error or a `__proto__` key. */
export function parseYaml(str: string): unknown {
  const doc = parseDocument(str, { prettyErrors: false });
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new Error(first?.message ?? "invalid YAML");
  }
  const value: unknown = doc.toJS();
  assertNoProtoKey(value);
  return value;
}

/** YAML text of `value` in the `yaml` library's default style, for every YAML file and frontmatter written. */
export function stringifyYml(value: unknown): string {
  return stringify(value);
}
