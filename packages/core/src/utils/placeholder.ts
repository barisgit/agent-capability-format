/**
 * `${NAME}`, the spelling of a placeholder. Built from parts so sources hold no `${...}` string
 * literal (biome noTemplateCurlyInString).
 */
export function placeholder(name: string): string {
  return `$${"{"}${name}}`;
}
