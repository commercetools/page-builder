/**
 * Deterministic JSON stringify — object keys sorted recursively — so two
 * structurally-equal values produce byte-identical strings. Used by the
 * persistence layer to detect whether a component's authored content changed
 * since its stored draft head (idempotent version appends).
 *
 * Browser-safe: unlike `packages/page-builder/src/catalog/envelope.ts` (which
 * hashes with `node:crypto`), this compares canonical strings directly, so it
 * runs in the Merchant Center app with no Node dependency.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(',')}}`;
}

/** Structural equality via canonical JSON. */
export function canonicalEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}
