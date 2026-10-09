/**
 * Orders strings by UTF-16 code units, as `Array.prototype.sort` does by default. Use it wherever
 * an order reaches written bytes or a hash (lockfile, sidecar, managed notices): `localeCompare`
 * follows the runtime's locale and ICU data, so the same input could serialize differently on
 * another machine.
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
