/**
 * An in-memory stand-in for the commercetools custom-object API.
 *
 * Every connector hook in this app reads and writes JSON blobs in custom-object
 * containers, so mocking at the level of "a store of objects" rather than per-query
 * canned responses means one fixture serves reads, writes and re-reads consistently:
 * a test can upsert through the hook and then assert on what the store holds.
 *
 * Versioning mirrors CT's optimistic concurrency — an upsert with a stale `version`
 * is rejected the way the real API rejects it.
 */

export type StoredCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
  lastModifiedAt: string;
};

export type CustomObjectSeed<T = unknown> = {
  container: string;
  key: string;
  value: T;
  /** Defaults to a generated `co-<n>`; set it when a ComponentRef must point at it. */
  id?: string;
  version?: number;
};

export class ConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Version mismatch: expected ${expected}, store holds ${actual}`);
    this.name = 'ConflictError';
  }
}

const FIXED_MODIFIED_AT = '2026-01-15T10:00:00.000Z';

export class CustomObjectStore {
  private objects = new Map<string, StoredCustomObject>();
  private idSeq = 0;

  private static slot(container: string, key: string) {
    return `${container}::${key}`;
  }

  /** Put objects in place without going through the mutation path. */
  seed(...seeds: CustomObjectSeed[]): StoredCustomObject[] {
    return seeds.map((seed) => {
      const stored: StoredCustomObject = {
        id: seed.id ?? `co-${++this.idSeq}`,
        key: seed.key,
        container: seed.container,
        version: seed.version ?? 1,
        value: seed.value,
        lastModifiedAt: FIXED_MODIFIED_AT,
      };
      this.objects.set(
        CustomObjectStore.slot(seed.container, seed.key),
        stored
      );
      return stored;
    });
  }

  get(container: string, key: string): StoredCustomObject | undefined {
    return this.objects.get(CustomObjectStore.slot(container, key));
  }

  getById(id: string): StoredCustomObject | undefined {
    return [...this.objects.values()].find((o) => o.id === id);
  }

  /** Everything in a container, insertion-ordered. */
  list(container: string): StoredCustomObject[] {
    return [...this.objects.values()].filter((o) => o.container === container);
  }

  all(): StoredCustomObject[] {
    return [...this.objects.values()];
  }

  upsert(
    container: string,
    key: string,
    value: unknown,
    version?: number | null
  ): StoredCustomObject {
    const slot = CustomObjectStore.slot(container, key);
    const existing = this.objects.get(slot);

    if (existing && version != null && version !== existing.version) {
      throw new ConflictError(version, existing.version);
    }

    const stored: StoredCustomObject = {
      id: existing?.id ?? `co-${++this.idSeq}`,
      key,
      container,
      version: (existing?.version ?? 0) + 1,
      value,
      lastModifiedAt: FIXED_MODIFIED_AT,
    };
    this.objects.set(slot, stored);
    return stored;
  }

  delete(
    container: string,
    key: string,
    version?: number | null
  ): StoredCustomObject | undefined {
    const slot = CustomObjectStore.slot(container, key);
    const existing = this.objects.get(slot);
    if (!existing) return undefined;
    if (version != null && version !== existing.version) {
      throw new ConflictError(version, existing.version);
    }
    this.objects.delete(slot);
    return existing;
  }

  reset() {
    this.objects.clear();
    this.idSeq = 0;
  }
}

/**
 * Evaluate the subset of CT predicate syntax these hooks actually build.
 *
 * Deliberately strict: an unrecognised predicate throws rather than returning an
 * empty result, because a silently-empty response looks like "no data" and sends
 * you hunting through the hook instead of the mock.
 */
export const matchesWhere = (
  object: StoredCustomObject,
  where?: string
): boolean => {
  if (!where || where.trim() === '') return true;
  const clause = where.trim();

  // `id in ("a", "b")` / `key in ("a", "b")`
  const inMatch = clause.match(/^(id|key)\s+in\s+\((.*)\)$/s);
  if (inMatch) {
    const [, field, list] = inMatch;
    const values = [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    return values.includes(object[field as 'id' | 'key']);
  }

  // `key="x"` / `id = "x"`
  const eqMatch = clause.match(/^(id|key)\s*=\s*"([^"]*)"$/);
  if (eqMatch) {
    const [, field, value] = eqMatch;
    return object[field as 'id' | 'key'] === value;
  }

  throw new Error(
    `Unsupported custom-object predicate in test mock: ${clause}\n` +
      'Extend matchesWhere() in test-utils/msw/custom-object-store.ts to cover it.'
  );
};

export const queryStore = (
  store: CustomObjectStore,
  container: string,
  where?: string,
  limit?: number,
  offset?: number
): { total: number; results: StoredCustomObject[] } => {
  const matched = store.list(container).filter((o) => matchesWhere(o, where));
  const from = offset ?? 0;
  const window =
    limit == null ? matched.slice(from) : matched.slice(from, from + limit);
  return { total: matched.length, results: window };
};
