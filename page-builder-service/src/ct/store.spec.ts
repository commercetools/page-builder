import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../cache.js';
import { createApiRoot } from './client.js';
import { createCtStore } from './store.js';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const failure = (status: number): Response => json({ statusCode: status, message: 'failed' }, status);

type Reply = unknown;

/** A real `apiRoot` over a scripted commercetools: each HTTP verb has a mock to program. */
function setup() {
  const get = vi.fn<(url: URL) => Reply>();
  const post = vi.fn<(url: URL, body: Record<string, unknown>) => Reply>();
  const del = vi.fn<(url: URL) => Reply>();
  const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname === '/oauth/token') return json({ access_token: 't', expires_in: 3600, token_type: 'Bearer' });
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const out = method === 'POST' ? await post(url, body) : method === 'DELETE' ? await del(url) : await get(url);
    return out instanceof Response ? out : json(out);
  };
  const client = createApiRoot(
    {
      projectKey: 'p',
      clientId: 'id',
      clientSecret: 's',
      authUrl: 'https://auth.test',
      apiUrl: 'https://api.test',
      scopes: 'manage_key_value_documents:p',
    },
    { fetch: fetchMock as typeof fetch }
  );
  const cache = new TtlCache(15);
  return { store: createCtStore(client, cache), get, post, del, cache };
}

const pathOf = (call: [URL, ...unknown[]]): string => call[0].pathname;
const queryOf = (call: [URL, ...unknown[]]): Record<string, string> => Object.fromEntries(call[0].searchParams);

const obj = (key: string, value: unknown = {}) => ({
  id: `id-${key}`,
  version: 1,
  container: 'c',
  key,
  value,
});

describe('createCtStore', () => {
  describe('get', () => {
    it('reads a custom object and caches it', async () => {
      const { store, get } = setup();
      get.mockReturnValue(obj('k'));
      await store.get('c', 'k');
      await store.get('c', 'k');
      expect(get).toHaveBeenCalledTimes(1);
      expect(pathOf(get.mock.calls[0])).toBe('/p/custom-objects/c/k');
    });

    it('returns null for a 404 and caches the absence', async () => {
      const { store, get } = setup();
      get.mockReturnValue(failure(404));
      expect(await store.get('c', 'k')).toBeNull();
      expect(await store.get('c', 'k')).toBeNull();
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('rethrows other errors without caching them', async () => {
      const { store, get } = setup();
      get.mockReturnValueOnce(failure(500)).mockReturnValueOnce(obj('k'));
      await expect(store.get('c', 'k')).rejects.toMatchObject({ statusCode: 500 });
      expect(await store.get('c', 'k')).toMatchObject({ key: 'k' });
    });

    it('bypasses the cache for preview/draft reads', async () => {
      const { store, get } = setup();
      get.mockReturnValue(obj('k'));
      await store.get('c', 'k');
      await store.get('c', 'k', { bypass: true });
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  describe('list', () => {
    it('paginates until the total is reached', async () => {
      const { store, get } = setup();
      const page = (n: number) => Array.from({ length: n }, (_, i) => obj(`k${i}`));
      get
        .mockReturnValueOnce({ results: page(500), total: 620 })
        .mockReturnValueOnce({ results: page(120), total: 620 });
      expect(await store.list('c')).toHaveLength(620);
      expect(pathOf(get.mock.calls[0])).toBe('/p/custom-objects/c');
      expect(queryOf(get.mock.calls[0])).toMatchObject({ limit: '500', offset: '0' });
      expect(queryOf(get.mock.calls[1])).toMatchObject({ limit: '500', offset: '500' });
    });

    it('stops on an empty page even if the total is overstated', async () => {
      const { store, get } = setup();
      get.mockReturnValueOnce({ results: [obj('a')], total: 5 }).mockReturnValueOnce({ results: [], total: 5 });
      expect(await store.list('c')).toHaveLength(1);
    });

    it('caches the listing', async () => {
      const { store, get } = setup();
      get.mockReturnValue({ results: [obj('a')], total: 1 });
      await store.list('c');
      await store.list('c');
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getByIds', () => {
    it('returns nothing for an empty list without calling commercetools', async () => {
      const { store, get } = setup();
      expect(await store.getByIds('c', [])).toEqual([]);
      expect(get).not.toHaveBeenCalled();
    });

    it('chunks ids and merges results, never caching', async () => {
      const { store, get } = setup();
      const ids = Array.from({ length: 150 }, (_, i) => `i${i}`);
      get.mockImplementation((url) => ({
        results: Array.from({ length: Number(url.searchParams.get('limit')) }, (_, i) => obj(`r${i}`)),
      }));
      expect(await store.getByIds('c', ids)).toHaveLength(150);
      expect(get).toHaveBeenCalledTimes(2);
      expect(queryOf(get.mock.calls[0]).where).toBe(`id in (${ids.slice(0, 100).map((i) => `"${i}"`).join(', ')})`);
      await store.getByIds('c', ids);
      expect(get).toHaveBeenCalledTimes(4);
    });
  });

  describe('put', () => {
    it('upserts with the version for optimistic concurrency', async () => {
      const { store, post } = setup();
      post.mockReturnValue(obj('k'));
      await store.put('c', 'k', { a: 1 }, 7);
      expect(pathOf(post.mock.calls[0])).toBe('/p/custom-objects');
      expect(post.mock.calls[0][1]).toEqual({ container: 'c', key: 'k', value: { a: 1 }, version: 7 });
    });

    it('omits the version for a create', async () => {
      const { store, post } = setup();
      post.mockReturnValue(obj('k'));
      await store.put('c', 'k', { a: 1 });
      expect(post.mock.calls[0][1]).toEqual({ container: 'c', key: 'k', value: { a: 1 } });
    });

    it('invalidates the object and its listing so the next read is fresh', async () => {
      const { store, get, post } = setup();
      get.mockReturnValueOnce(obj('k', 'old')).mockReturnValueOnce({ results: [], total: 0 });
      await store.get('c', 'k');
      await store.list('c');
      post.mockReturnValue(obj('k', 'new'));
      await store.put('c', 'k', 'new');
      get.mockReturnValueOnce(obj('k', 'new')).mockReturnValueOnce({ results: [obj('k')], total: 1 });
      expect(await store.get('c', 'k')).toMatchObject({ value: 'new' });
      expect(await store.list('c')).toHaveLength(1);
    });

    it('invalidates even when the write fails with a stale-version conflict', async () => {
      const { store, get, post } = setup();
      get.mockReturnValue(obj('k'));
      await store.get('c', 'k');
      post.mockReturnValue(failure(409));
      await expect(store.put('c', 'k', {}, 1)).rejects.toMatchObject({ statusCode: 409 });
      await store.get('c', 'k');
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  describe('query', () => {
    it('reads one uncached page with a total', async () => {
      const { store, get } = setup();
      const page = { results: [obj('k')], total: 1, offset: 0, limit: 20, count: 1 };
      get.mockReturnValue(page);
      expect(await store.query('c', { where: 'id in ("a")', limit: 20, offset: 0 })).toEqual(page);
      await store.query('c', { limit: 20, offset: 0 });
      expect(get).toHaveBeenCalledTimes(2);
      expect(queryOf(get.mock.calls[0])).toEqual({ where: 'id in ("a")', limit: '20', offset: '0', withTotal: 'true' });
    });
  });

  describe('remove', () => {
    it('deletes with the version and invalidates the cache', async () => {
      const { store, get, del } = setup();
      get.mockReturnValue(obj('k'));
      await store.get('c', 'k');
      del.mockReturnValue(obj('k'));
      expect(await store.remove('c', 'k', 4)).toMatchObject({ key: 'k' });
      expect(pathOf(del.mock.calls[0])).toBe('/p/custom-objects/c/k');
      expect(queryOf(del.mock.calls[0])).toEqual({ version: '4' });
      await store.get('c', 'k');
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('resolves null when the object is already gone and rethrows other errors', async () => {
      const { store, del } = setup();
      del.mockReturnValueOnce(failure(404));
      expect(await store.remove('c', 'k')).toBeNull();
      del.mockReturnValueOnce(failure(409));
      await expect(store.remove('c', 'k', 1)).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
