import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { renderAuth, safeEqual } from './auth.js';

let app: FastifyInstance | undefined;

function server(config: { renderKey?: string; renderOrigins?: string[] }): FastifyInstance {
  app = Fastify();
  app.get(
    '/render',
    { preHandler: renderAuth({ renderKey: config.renderKey, renderOrigins: config.renderOrigins ?? [] }) },
    async () => ({ ok: true })
  );
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (config: Parameters<typeof server>[0], headers: Record<string, string> = {}) =>
  server(config).inject({ method: 'GET', url: '/render', headers });

describe('safeEqual', () => {
  it.each([
    ['same', 'same', true],
    ['same', 'diff', false],
    ['short', 'longer-value', false],
    ['', '', true],
    ['', 'x', false],
  ])('safeEqual(%j, %j) = %s', (a, b, expected) => {
    expect(safeEqual(a, b)).toBe(expected);
  });
});

describe('renderAuth', () => {
  it('skips both checks when neither is configured (local development)', async () => {
    expect((await get({})).statusCode).toBe(200);
  });

  describe('render key', () => {
    it('accepts the right key', async () => {
      expect((await get({ renderKey: 'k' }, { 'x-pb-render-key': 'k' })).statusCode).toBe(200);
    });

    it.each([[{}], [{ 'x-pb-render-key': 'wrong' }], [{ 'x-pb-render-key': '' }]])(
      'rejects a missing or wrong key with 401 (%j)',
      async (headers) => {
        const res = await get({ renderKey: 'k' }, headers);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
          error: { code: 'invalid_render_key', message: 'Missing or invalid render key' },
        });
      }
    );
  });

  describe('origin allowlist', () => {
    const renderOrigins = ['https://shop.example.com'];

    it('accepts a browser Origin on the allowlist', async () => {
      expect((await get({ renderOrigins }, { origin: 'https://shop.example.com' })).statusCode).toBe(200);
    });

    it('accepts a server-side X-PB-Origin on the allowlist, ignoring path and case', async () => {
      const res = await get({ renderOrigins }, { 'x-pb-origin': 'HTTPS://Shop.Example.com/some/path' });
      expect(res.statusCode).toBe(200);
    });

    it('prefers the browser Origin over X-PB-Origin', async () => {
      const res = await get(
        { renderOrigins },
        { origin: 'https://evil.example.com', 'x-pb-origin': 'https://shop.example.com' }
      );
      expect(res.statusCode).toBe(403);
    });

    it.each([
      [{ origin: 'https://evil.example.com' }],
      [{ 'x-pb-origin': 'http://shop.example.com' }],
      [{ 'x-pb-origin': 'not a url' }],
      [{}],
    ])('rejects an unknown, malformed or absent origin with 403 (%j)', async (headers) => {
      const res = await get({ renderOrigins }, headers);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
    });
  });

  it('checks the key before the origin', async () => {
    const res = await get(
      { renderKey: 'k', renderOrigins: ['https://shop.example.com'] },
      { 'x-pb-render-key': 'wrong', origin: 'https://evil.example.com' }
    );
    expect(res.statusCode).toBe(401);
  });

  it('requires both when both are configured', async () => {
    const config = { renderKey: 'k', renderOrigins: ['https://shop.example.com'] };
    const ok = await get(config, { 'x-pb-render-key': 'k', 'x-pb-origin': 'https://shop.example.com' });
    expect(ok.statusCode).toBe(200);
    expect((await get(config, { 'x-pb-render-key': 'k' })).statusCode).toBe(403);
  });
});
