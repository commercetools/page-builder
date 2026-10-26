import { describe, expect, it, vi } from 'vitest';
import type { CtConfig } from '../config.js';
import { CT_TIMEOUT_MS, createApiRoot, ctStatus, isCtError, isCtStatus } from './client.js';

const ct: CtConfig = {
  projectKey: 'us-store',
  clientId: 'id',
  clientSecret: 'secret',
  authUrl: 'https://auth.test',
  apiUrl: 'https://api.test',
  scopes: 'manage_key_value_documents:us-store view_products:us-store',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const tokenRes = (expiresIn = 3600, value = 't1'): Response =>
  json({ access_token: value, expires_in: expiresIn, token_type: 'Bearer' });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function harness(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  });
  const api = createApiRoot(ct, { fetch: fetchMock as unknown as typeof fetch });
  return { api, calls };
}

const isToken = (url: string): boolean => url.endsWith('/oauth/token');
const header = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name] ?? (init.headers as Record<string, string>)[name.toLowerCase()];

describe('createApiRoot', () => {
  it('fetches a client-credentials token with the configured scopes and sends it as a bearer token', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({ ok: true })));
    const res = await h.api.customObjects().withContainerAndKey({ container: 'c', key: 'k' }).get().execute();
    expect(res.body).toEqual({ ok: true });

    const [auth, api] = h.calls;
    expect(auth.url).toBe('https://auth.test/oauth/token');
    expect(String(auth.init.body)).toContain('grant_type=client_credentials');
    expect(decodeURIComponent(String(auth.init.body))).toContain(
      'scope=manage_key_value_documents:us-store view_products:us-store'
    );
    expect(header(auth.init, 'Authorization')).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(api.url).toBe('https://api.test/us-store/custom-objects/c/k');
    expect(header(api.init, 'Authorization')).toBe('Bearer t1');
  });

  it('reuses the token across calls', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({})));
    await h.api.categories().get().execute();
    await h.api.categories().get().execute();
    expect(h.calls.filter((c) => isToken(c.url))).toHaveLength(1);
  });

  it('serialises query params, skipping undefined and repeating arrays', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({})));
    await h.api
      .productProjections()
      .get({ queryArgs: { limit: 5, where: 'a = "b"', offset: undefined, expand: ['x', 'y'], staged: true } })
      .execute();
    const url = new URL(h.calls[1].url);
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('where')).toBe('a = "b"');
    expect(url.searchParams.has('offset')).toBe(false);
    expect(url.searchParams.getAll('expand')).toEqual(['x', 'y']);
    expect(url.searchParams.get('staged')).toBe('true');
  });

  it('posts a JSON body', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({ id: '1' })));
    const res = await h.api.customObjects().post({ body: { container: 'c', key: 'k', value: 1 } }).execute();
    expect(res.body).toEqual({ id: '1' });
    const post = h.calls[1];
    expect(post.init.method).toBe('POST');
    expect(JSON.parse(String(post.init.body))).toEqual({ container: 'c', key: 'k', value: 1 });
  });

  it('deletes with query params', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({ id: '1' })));
    await h.api.customObjects().withContainerAndKey({ container: 'c', key: 'k' }).delete({ queryArgs: { version: 3 } }).execute();
    expect(h.calls[1].init.method).toBe('DELETE');
    expect(h.calls[1].url).toBe('https://api.test/us-store/custom-objects/c/k?version=3');
  });

  it('throws an error carrying the status when commercetools rejects the call', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({ message: 'nope' }, 404)));
    const err = await h.api.categories().withKey({ key: 'missing' }).get().execute().catch((e: unknown) => e);
    expect(ctStatus(err)).toBe(404);
    expect(isCtStatus(err, 404)).toBe(true);
    expect(isCtStatus(err, 409)).toBe(false);
  });

  it('does not retry a failing call', async () => {
    const h = harness((url) => (isToken(url) ? tokenRes() : json({ message: 'down' }, 503)));
    await expect(h.api.categories().get().execute()).rejects.toMatchObject({ statusCode: 503 });
    expect(h.calls.filter((c) => !isToken(c.url))).toHaveLength(1);
  });

  it('throws when the token endpoint rejects the credentials', async () => {
    const h = harness(() => json({ error: 'invalid_client' }, 401));
    const err = await h.api.categories().get().execute().catch((e: unknown) => e);
    expect(isCtError(err)).toBe(true);
    expect(h.calls.filter((c) => !isToken(c.url))).toHaveLength(0);
  });

  it('bounds every call with a timeout', async () => {
    expect(CT_TIMEOUT_MS).toBeGreaterThan(0);
    const h = harness(
      (url, init) =>
        isToken(url)
          ? tokenRes()
          : new Promise<Response>((_, reject) => {
              init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            })
    );
    vi.useFakeTimers();
    try {
      const pending = h.api.categories().get().execute().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(CT_TIMEOUT_MS + 1);
      const err = await pending;
      expect(err).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isCtError', () => {
  it('recognises client failures only', () => {
    expect(isCtError({ statusCode: 500 })).toBe(true);
    expect(isCtError({ statusCode: undefined })).toBe(true);
    expect(isCtError(new Error('x'))).toBe(false);
    expect(isCtError('x')).toBe(false);
  });
});

describe('ctStatus', () => {
  it('reads statusCode from error-shaped values only', () => {
    expect(ctStatus({ statusCode: 409 })).toBe(409);
    expect(ctStatus(new Error('x'))).toBeUndefined();
    expect(ctStatus(null)).toBeUndefined();
    expect(ctStatus({ statusCode: '409' })).toBeUndefined();
  });
});
