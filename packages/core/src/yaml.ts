import { parseDocument, stringify } from "yaml";

export function parseYaml(str: string): unknown {
  const doc = parseDocument(str, { prettyErrors: false });
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new Error(first?.message ?? "invalid YAML");
  }
  return doc.toJS();
}

export function stringifyYml(value: unknown): string {
  return stringify(value);
}
