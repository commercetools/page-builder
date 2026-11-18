/**
 * Custom-object access with the short read cache.
 *
 * Reads go through the cache unless `bypass` is set (preview/draft). Writes invalidate the
 * object and its container listing so the service never serves a value older than its own
 * last write. `getByIds` is never cached: it hydrates draft component references.
 */

import type { ReadOptions, TtlCache } from '../cache.js';
import { isCtStatus, type ApiRoot } from './client.js';

export interface CtCustomObject<T = unknown> {
  id: string;
  version: number;
  container: string;
  key: string;
  value: T;
  lastModifiedAt?: string;
}

export interface CtStore {
  get<T>(container: string, key: string, options?: ReadOptions): Promise<CtCustomObject<T> | null>;
  list<T>(container: string, options?: ReadOptions): Promise<CtCustomObject<T>[]>;
  getByIds<T>(container: string, ids: string[]): Promise<CtCustomObject<T>[]>;
  /** Upsert; when `version` is given CT rejects a stale write with 409. */
  put<T>(container: string, key: string, value: T, version?: number): Promise<CtCustomObject<T>>;
  /** Delete; when `version` is given CT rejects a stale delete with 409. Resolves null when absent. */
  remove<T>(container: string, key: string, version?: number): Promise<CtCustomObject<T> | null>;
  /** One uncached page of a container, optionally filtered by a commercetools `where` predicate. */
  query<T>(container: string, options: { where?: string; limit: number; offset: number }): Promise<CtPage<T>>;
}

export interface CtPage<T = unknown> {
  results: CtCustomObject<T>[];
  total: number;
  offset: number;
  limit: number;
  count: number;
}

const PAGE_SIZE = 500;
const ID_CHUNK = 100;

const objectKey = (container: string, key: string): string => `co:${container}/${key}`;
const listKey = (container: string): string => `col:${container}`;

export function createCtStore(client: ApiRoot, cache: TtlCache): CtStore {
  return {
    get: (container, key, options) =>
      cache.read(
        objectKey(container, key),
        async () => {
          try {
            const res = await client.customObjects().withContainerAndKey({ container, key }).get().execute();
            return res.body as CtCustomObject;
          } catch (err) {
            if (isCtStatus(err, 404)) return null;
            throw err;
          }
        },
        options
      ) as never,

    list: (container, options) =>
      cache.read(
        listKey(container),
        async () => {
          const results: CtCustomObject[] = [];
          for (let offset = 0; ; offset += PAGE_SIZE) {
            // Sequential by necessity: the next offset depends on the previous page's total.
            const { body: page } = await client
              .customObjects()
              .withContainer({ container })
              .get({ queryArgs: { limit: PAGE_SIZE, offset, withTotal: true } })
              .execute();
            results.push(...page.results);
            const total = page.total ?? 0;
            if (results.length >= total || page.results.length === 0) break;
          }
          return results;
        },
        options
      ) as never,

    async getByIds<T>(container: string, ids: string[]): Promise<CtCustomObject<T>[]> {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
      const pages = await Promise.all(
        chunks.map((chunk) =>
          client
            .customObjects()
            .withContainer({ container })
            .get({ queryArgs: { where: `id in (${chunk.map((id) => `"${id}"`).join(', ')})`, limit: chunk.length } })
            .execute()
        )
      );
      return pages.flatMap((p) => p.body.results as CtCustomObject<T>[]);
    },

    async query<T>(container: string, { where, limit, offset }: { where?: string; limit: number; offset: number }) {
      const res = await client
        .customObjects()
        .withContainer({ container })
        .get({ queryArgs: { where, limit, offset, withTotal: true } })
        .execute();
      return res.body as CtPage<T>;
    },

    async remove<T>(container: string, key: string, version?: number) {
      try {
        const res = await client
          .customObjects()
          .withContainerAndKey({ container, key })
          .delete({ queryArgs: { version } })
          .execute();
        return res.body as CtCustomObject<T>;
      } catch (err) {
        if (isCtStatus(err, 404)) return null;
        throw err;
      } finally {
        cache.delete(objectKey(container, key));
        cache.delete(listKey(container));
      }
    },

    async put<T>(container: string, key: string, value: T, version?: number) {
      try {
        const res = await client
          .customObjects()
          .post({ body: { container, key, value, ...(typeof version === 'number' ? { version } : {}) } })
          .execute();
        return res.body as CtCustomObject<T>;
      } finally {
        // Invalidate even on failure: a 409 means our cached copy is stale.
        cache.delete(objectKey(container, key));
        cache.delete(listKey(container));
      }
    },
  };
}
