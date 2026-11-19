/**
 * Short-lived in-memory cache for commercetools reads.
 *
 * - Entries expire `ttlSeconds` after being loaded; a TTL of 0 disables caching entirely.
 * - Concurrent reads of the same key share one load (single-flight).
 * - Failures are never cached: a rejected load is forgotten so the next read retries.
 * - `bypass` skips both the read and the write, which is how preview/draft reads stay fresh.
 * - Bounded: when full, the oldest entry is evicted.
 */

export interface TtlCacheOptions {
  now?: () => number;
  maxEntries?: number;
}

export interface ReadOptions {
  /** Skip the cache for this read (preview/draft): nothing is read, shared, or stored. */
  bypass?: boolean;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class TtlCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(ttlSeconds: number, options: TtlCacheOptions = {}) {
    this.ttlMs = ttlSeconds * 1000;
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 500;
  }

  get size(): number {
    return this.entries.size;
  }

  async read<T>(key: string, load: () => Promise<T>, options: ReadOptions = {}): Promise<T> {
    if (options.bypass || this.ttlMs <= 0) return load();

    const hit = this.entries.get(key);
    if (hit) {
      if (hit.expiresAt > this.now()) return hit.value as T;
      this.entries.delete(key);
    }

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    // Only the load still registered under `key` may populate the cache: a `delete` during the
    // load (e.g. a write invalidating this key) orphans it, and its stale result is dropped.
    const loading: Promise<T> = load().then(
      (value) => {
        if (this.inflight.get(key) === loading) {
          this.inflight.delete(key);
          this.store(key, value);
        }
        return value;
      },
      (err: unknown) => {
        if (this.inflight.get(key) === loading) this.inflight.delete(key);
        throw err;
      }
    );
    this.inflight.set(key, loading);
    return loading;
  }

  /** Forget a key, including any load in flight so a stale result cannot repopulate it. */
  delete(key: string): void {
    this.entries.delete(key);
    this.inflight.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  private store(key: string, value: unknown): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }
}
