import { describe, expect, it, vi } from 'vitest';
import { fetchRender, renderUrl, type RenderParams } from './client.js';
import type { ShimConfig } from './config.js';

const config: ShimConfig = { serviceUrl: 'https://svc.test/service', renderKey: 'key', origin: 'https://shop.test', timeoutMs: 50 };
const params: RenderParams = { path: '/en-us/category/women', locale: 'en-US', currency: 'USD', country: 'US', store: 'gap', search: 'sort=newest&facet.color=red' };
const tree = { wireVersion: 1, preview: false, editMode: false, sections: [] };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const withFetch = (impl: (url: string, init: RequestInit) => Response | Promise<Response>) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => impl(String(url), init ?? {})) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('renderUrl', () => {
  it('builds the render URL with every parameter, encoded', () => {
    const url = new URL(renderUrl(config, params));
    expect(url.origin + url.pathname).toBe('https://svc.test/service/v1/render');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      path: '/en-us/category/women',
      locale: 'en-US',
      currency: 'USD',
      country: 'US',
      store: 'gap',
      search: 'sort=newest&facet.color=red',
    });
  });

  it('omits the optional store and search', () => {
    const url = new URL(renderUrl(config, { ...params, store: undefined, search: '' }));
    expect(url.searchParams.has('store')).toBe(false);
    expect(url.searchParams.has('search')).toBe(false);
  });
});

describe('fetchRender', () => {
  it('sends the wire version, render key and origin, and never uses a cache', async () => {
    const f = withFetch(() => json(tree));
    expect(await fetchRender(config, params, f)).toEqual({ status: 'ok', tree });
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers).toMatchObject({ 'x-pb-wire-version': '1', 'x-pb-render-key': 'key', 'x-pb-origin': 'https://shop.test' });
    expect(init.cache).toBe('no-store');
  });

  it('omits the key and origin headers when not configured', async () => {
    const f = withFetch(() => json(tree));
    await fetchRender({ ...config, renderKey: undefined, origin: undefined }, params, f);
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Object.keys(init.headers)).toEqual(['x-pb-wire-version', 'accept']);
  });

  it('classifies a 404 as not found', async () => {
    expect(await fetchRender(config, params, withFetch(() => json({ error: { code: 'page_not_found' } }, 404)))).toEqual({ status: 'not_found' });
  });

  it('classifies a 404 without the service\'s page_not_found code as a bad route, not a missing page', async () => {
    expect(await fetchRender(config, params, withFetch(() => json({ error: { code: 'not_found', message: 'Route not found' } }, 404)))).toEqual({
      status: 'error',
      reason: 'bad_route',
      httpStatus: 404,
      detail: 'Route not found',
    });
    expect(await fetchRender(config, params, withFetch(() => new Response('<html>nope</html>', { status: 404 })))).toMatchObject({
      status: 'error',
      reason: 'bad_route',
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [500, 'server'],
    [503, 'server'],
  ])('classifies HTTP %i as %s', async (status, reason) => {
    expect(await fetchRender(config, params, withFetch(() => json({}, status)))).toMatchObject({ status: 'error', reason, httpStatus: status });
  });

  it('classifies an unsupported wire version (426) with the service message', async () => {
    const f = withFetch(() => json({ error: { code: 'wire_version_unsupported', message: 'supported versions: 2' }, supported: [2] }, 426));
    expect(await fetchRender(config, params, f)).toMatchObject({ status: 'error', reason: 'wire_version', httpStatus: 426, detail: 'supported versions: 2' });
  });

  it('classifies a missing wire version header (400) as a wire version error', async () => {
    const f = withFetch(() => json({ error: { code: 'wire_version_required', message: 'header required' } }, 400));
    expect(await fetchRender(config, params, f)).toMatchObject({ status: 'error', reason: 'wire_version', detail: 'header required' });
  });

  it('treats any other 400 as a server error', async () => {
    expect(await fetchRender(config, params, withFetch(() => json({ error: { code: 'bad_request' } }, 400)))).toMatchObject({ reason: 'server', httpStatus: 400 });
    expect(await fetchRender(config, params, withFetch(() => new Response('not json', { status: 400 })))).toMatchObject({ reason: 'server' });
  });

  it('classifies a 200 that is not a render tree as a bad response', async () => {
    expect(await fetchRender(config, params, withFetch(() => json({ nope: true })))).toMatchObject({ reason: 'bad_response' });
    expect(await fetchRender(config, params, withFetch(() => json(null)))).toMatchObject({ reason: 'bad_response' });
    expect(await fetchRender(config, params, withFetch(() => new Response('<html>', { status: 200 })))).toMatchObject({ status: 'error' });
  });

  it('classifies a network failure with its message', async () => {
    const f = withFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    expect(await fetchRender(config, params, f)).toEqual({ status: 'error', reason: 'network', detail: 'ECONNREFUSED' });
    const g = withFetch(() => Promise.reject('plain string'));
    expect(await fetchRender(config, params, g)).toMatchObject({ reason: 'network', detail: 'plain string' });
  });

  it('aborts and classifies a slow service as a timeout', async () => {
    const slow = withFetch(
      (_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })
    );
    expect(await fetchRender({ ...config, timeoutMs: 10 }, params, slow)).toEqual({ status: 'error', reason: 'timeout' });
  });
});
