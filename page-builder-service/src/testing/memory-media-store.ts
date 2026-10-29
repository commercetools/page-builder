/** An in-memory `MediaStore`, so route and service tests (and `dev:fake`) need no bucket. */

import type { ListInput, ListPage, MediaStore, PutInput, StoredObject } from '../media/store.js';

export interface MemoryMediaStore extends MediaStore {
  readonly objects: Map<string, { body: Buffer; contentType: string }>;
}

export function createMemoryMediaStore(baseUrl = 'https://storage.test/bucket'): MemoryMediaStore {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    async put(input: PutInput): Promise<StoredObject> {
      objects.set(input.key, { body: input.body, contentType: input.contentType });
      return { key: input.key, url: `${baseUrl}/${input.key}`, size: input.body.length, contentType: input.contentType };
    },
    async list(input: ListInput): Promise<ListPage> {
      const keys = [...objects.keys()].filter((k) => k.startsWith(input.prefix)).sort();
      // The continuation token is simply how many keys have been served.
      const start = input.cursor ? Number(input.cursor) : 0;
      const page = keys.slice(start, start + input.limit);
      const next = start + input.limit;
      return {
        files: page.map((key) => {
          const object = objects.get(key)!;
          return { key, url: `${baseUrl}/${key}`, name: key.slice(key.lastIndexOf('/') + 1), size: object.body.length, contentType: object.contentType };
        }),
        nextCursor: next < keys.length ? String(next) : null,
      };
    },
  };
}
