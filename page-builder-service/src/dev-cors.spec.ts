import { describe, expect, it } from 'vitest';
import { testApp } from './testing/fixtures.js';

const token = 'dev-editor-token-1234';
const origin = 'http://localhost:3001';
const dev = { devToken: token, editorOrigins: [origin] };
const preflight = (url: string, from = origin) => ({
  method: 'OPTIONS' as const,
  url,
  headers: { origin: from, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
});

describe('development CORS', () => {
  it('answers the preflight of an admin route for the editor origin, without credentials', async () => {
    const res = await testApp(dev).app.inject(preflight('/v1/admin/objects/page-editor/k'));
    expect(res.statusCode).toBe(204);
    expect(res.headers).toMatchObject({
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, PUT, DELETE',
      'access-control-allow-headers': 'authorization, content-type',
      vary: 'origin',
    });
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.body).toBe('');
  });

  it('answers the preflight of the media route even though it is not set up there', async () => {
    const res = await testApp(dev).app.inject(preflight('/v1/admin/media'));
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('lets the browser read an authenticated answer and a refusal alike', async () => {
    const t = testApp(dev);
    const url = '/v1/admin/objects/page-editor/nope';
    const ok = await t.app.inject({ method: 'GET', url, headers: { origin, authorization: `Bearer ${token}` } });
    expect(ok.statusCode).toBe(404);
    expect(ok.headers['access-control-allow-origin']).toBe(origin);
    const refused = await t.app.inject({ method: 'GET', url, headers: { origin } });
    expect(refused.statusCode).toBe(401);
    expect(refused.headers['access-control-allow-origin']).toBe(origin);
  });

  it('gives no other origin any access, nor any other route', async () => {
    const t = testApp(dev);
    const foreign = await t.app.inject(preflight('/v1/admin/media', 'https://evil.example'));
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    expect(foreign.statusCode).not.toBe(204);
    const render = await t.app.inject({ method: 'GET', url: '/healthz', headers: { origin } });
    expect(render.headers['access-control-allow-origin']).toBeUndefined();
    const none = await t.app.inject({ method: 'GET', url: '/v1/admin/objects/page-editor/nope', headers: { authorization: `Bearer ${token}` } });
    expect(none.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('is not registered at all without a development token', async () => {
    const t = testApp({ editorOrigins: [origin] });
    const res = await t.app.inject(preflight('/v1/admin/media'));
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.statusCode).not.toBe(204);
  });

  it('honours the Connect base path', async () => {
    const t = testApp({ ...dev, basePath: '/service' });
    const res = await t.app.inject(preflight('/service/v1/admin/media'));
    expect(res.statusCode).toBe(204);
    const outside = await t.app.inject(preflight('/v1/admin/media'));
    expect(outside.headers['access-control-allow-origin']).toBeUndefined();
  });
});
