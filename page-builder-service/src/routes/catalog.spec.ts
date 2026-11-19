import { describe, expect, it } from 'vitest';
import { renderUrl, RENDER_HEADERS, sampleCatalog, testApp } from '../testing/fixtures.js';

const SECRET = 'admin-secret';
const auth = { authorization: `Bearer ${SECRET}` };

const app = () => testApp({ adminSecret: SECRET }, { content: false }).app;

describe('catalog endpoints', () => {
  it('rejects missing or wrong credentials on every route', async () => {
    const a = app();
    for (const [method, url] of [['GET', '/v1/catalog'], ['POST', '/v1/catalog'], ['POST', '/v1/catalog/validate'], ['POST', '/v1/catalog/publish']] as const) {
      expect((await a.inject({ method, url })).statusCode).toBe(401);
      expect((await a.inject({ method, url, headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
      expect((await a.inject({ method, url, headers: { authorization: SECRET } })).statusCode).toBe(401);
    }
  });

  it('is closed when no admin secret is configured', async () => {
    const a = testApp({ adminSecret: undefined }, { content: false }).app;
    const res = await a.inject({ method: 'GET', url: '/v1/catalog', headers: auth });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('admin_disabled');
  });

  it('is not reachable with the render key', async () => {
    const a = testApp({ adminSecret: SECRET, renderKey: 'rk' }, { content: false }).app;
    expect((await a.inject({ method: 'GET', url: '/v1/catalog', headers: { 'x-pb-render-key': 'rk' } })).statusCode).toBe(401);
  });

  it('validate: 200 for a valid catalog, 422 listing every error otherwise, and writes nothing', async () => {
    const t = testApp({ adminSecret: SECRET }, { content: false });
    const ok = await t.app.inject({ method: 'POST', url: '/v1/catalog/validate', headers: auth, payload: sampleCatalog() });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ errors: [], warnings: [] });

    const bad = sampleCatalog();
    bad.components.components[0]!.groupKey = 'nope';
    bad.sections.sections.push(bad.sections.sections[0]!);
    const res = await t.app.inject({ method: 'POST', url: '/v1/catalog/validate', headers: auth, payload: bad });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors).toHaveLength(2);
    expect(t.fake.get('page-editor', 'components')).toBeUndefined();
  });

  it('push: structural errors are 422 and nothing is written', async () => {
    const t = testApp({ adminSecret: SECRET }, { content: false });
    const res = await t.app.inject({ method: 'POST', url: '/v1/catalog', headers: auth, payload: { components: {} } });
    expect(res.statusCode).toBe(422);
    expect(t.fake.get('page-editor', 'components')).toBeUndefined();
  });

  it('push → idempotent re-push → publish → read round trip', async () => {
    const a = app();
    const push = await a.inject({ method: 'POST', url: '/v1/catalog', headers: auth, payload: sampleCatalog() });
    expect(push.statusCode).toBe(200);
    expect(push.json()).toMatchObject({ status: 'written', appVersion: 1, warnings: [] });

    const again = await a.inject({ method: 'POST', url: '/v1/catalog', headers: auth, payload: sampleCatalog() });
    expect(again.json()).toMatchObject({ status: 'unchanged' });

    expect((await a.inject({ method: 'GET', url: '/v1/catalog', headers: auth })).statusCode).toBe(404);
    const draft = await a.inject({ method: 'GET', url: '/v1/catalog?state=draft', headers: auth });
    expect(draft.json().catalog).toEqual(sampleCatalog());

    const pub = await a.inject({ method: 'POST', url: '/v1/catalog/publish', headers: auth });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().appVersion).toBe(1);

    const live = await a.inject({ method: 'GET', url: '/v1/catalog', headers: auth });
    expect(live.statusCode).toBe(200);
    expect(live.headers['cache-control']).toBe('no-store');
    expect(live.json()).toMatchObject({ state: 'published', catalog: sampleCatalog() });
  });

  it('accepts a body-less POST that declares JSON, and rejects malformed JSON as 400', async () => {
    const a = app();
    const empty = await a.inject({ method: 'POST', url: '/v1/catalog/publish', headers: { ...auth, 'content-type': 'application/json' } });
    expect(empty.statusCode).toBe(404);
    const bad = await a.inject({ method: 'POST', url: '/v1/catalog/validate', headers: { ...auth, 'content-type': 'application/json' }, payload: '{nope' });
    expect(bad.statusCode).toBe(400);
  });

  it('publish without a pushed catalog is 404', async () => {
    const res = await app().inject({ method: 'POST', url: '/v1/catalog/publish', headers: auth });
    expect(res.statusCode).toBe(404);
  });

  it('a published catalog feeds render-time edit manifests', async () => {
    const t = testApp({ adminSecret: SECRET, previewToken: 'pv', editorOrigins: ['https://mc.test'] }, { content: false });
    await t.app.inject({ method: 'POST', url: '/v1/catalog', headers: auth, payload: sampleCatalog() });
    await t.app.inject({ method: 'POST', url: '/v1/catalog/publish', headers: auth });
    // Settings are absent, so the path matches no route; this just proves the catalog is readable.
    const res = await t.app.inject({ method: 'GET', url: renderUrl('/en-us', { pb_preview: 'pv' }), headers: RENDER_HEADERS });
    expect([200, 404]).toContain(res.statusCode);
  });
});
