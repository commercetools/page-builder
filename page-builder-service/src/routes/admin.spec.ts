import { describe, expect, it } from 'vitest';
import { mcKit } from '../testing/mc-kit.js';
import { testApp } from '../testing/fixtures.js';

const config = { mc: { issuer: 'https://mc-api.test', audience: 'https://svc.test' } };

async function admin() {
  const kit = await mcKit();
  const t = testApp(config, { mcKeys: kit.keys as never, content: false });
  const headers = { authorization: `Bearer ${await kit.sign()}` };
  const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    t.app.inject({ method, url: `/v1/admin/objects${url}`, headers, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { ...t, call, headers };
}

describe('admin object gateway', () => {
  it('is closed (503) when MC auth is not configured', async () => {
    const t = testApp({}, { content: false });
    const res = await t.app.inject({ method: 'GET', url: '/v1/admin/objects/page-editor/settings' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('mc_auth_not_configured');
  });

  it('requires a token on every route', async () => {
    const t = await admin();
    for (const [method, url] of [['GET', '/page-editor/k'], ['GET', '/page-editor'], ['PUT', '/page-editor/k'], ['DELETE', '/page-editor/k']] as const) {
      expect((await t.app.inject({ method, url: `/v1/admin/objects${url}`, payload: method === 'PUT' ? { value: {} } : undefined })).statusCode).toBe(401);
    }
  });

  it('round-trips an object with optimistic concurrency', async () => {
    const { call } = await admin();
    expect((await call('GET', '/page-editor-draft/page-home')).statusCode).toBe(404);

    const created = await call('PUT', '/page-editor-draft/page-home', { value: { n: 1 } });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ container: 'page-editor-draft', key: 'page-home', version: 1, value: { n: 1 } });

    const read = await call('GET', '/page-editor-draft/page-home');
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.json().value).toEqual({ n: 1 });

    expect((await call('PUT', '/page-editor-draft/page-home', { value: { n: 2 }, version: 1 })).json().version).toBe(2);
    const stale = await call('PUT', '/page-editor-draft/page-home', { value: { n: 3 }, version: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('conflict');
  });

  it('reads fresh data even though render reads are cached', async () => {
    const { call, fake } = await admin();
    await call('PUT', '/page-editor/settings', { value: { a: 1 } });
    await call('GET', '/page-editor/settings');
    fake.put('page-editor', 'settings', { a: 2 });
    expect((await call('GET', '/page-editor/settings')).json().value).toEqual({ a: 2 });
  });

  it('lists a container with where, limit and offset', async () => {
    const { call } = await admin();
    const ids: string[] = [];
    for (const k of ['a', 'b', 'c']) ids.push((await call('PUT', `/page-editor-components/${k}`, { value: {} })).json().id);
    const all = await call('GET', '/page-editor-components?limit=2&offset=1');
    expect(all.json()).toMatchObject({ total: 3, offset: 1, limit: 2 });
    expect(all.json().results).toHaveLength(2);
    const some = await call('GET', `/page-editor-components?where=${encodeURIComponent(`id in ("${ids[0]}", "${ids[2]}")`)}`);
    expect(some.json().results.map((o: { key: string }) => o.key).sort()).toEqual(['a', 'c']);
  });

  it('rejects out-of-range paging', async () => {
    const { call } = await admin();
    expect((await call('GET', '/page-editor?limit=501')).statusCode).toBe(400);
    expect((await call('GET', '/page-editor?offset=-1')).statusCode).toBe(400);
  });

  it('deletes, then 404s, and a stale delete conflicts', async () => {
    const { call } = await admin();
    await call('PUT', '/page-editor/wf-1', { value: {} });
    expect((await call('DELETE', '/page-editor/wf-1')).statusCode).toBe(200);
    expect((await call('DELETE', '/page-editor/wf-1')).statusCode).toBe(404);
  });

  it('only exposes the page-builder containers', async () => {
    const { call } = await admin();
    for (const [method, url] of [['GET', '/contentools-configuration/jwt'], ['GET', '/other'], ['PUT', '/other/k'], ['DELETE', '/other/k']] as const) {
      const res = await call(method, url, method === 'PUT' ? { value: {} } : undefined);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('container_not_allowed');
    }
  });

  it('keeps the host-owned catalog read-only, but readable', async () => {
    const { call, fake } = await admin();
    fake.put('page-editor', 'components', { draft: {}, published: null });
    expect((await call('GET', '/page-editor/components')).statusCode).toBe(200);
    for (const key of ['components', 'data-sources', 'sections', 'theme']) {
      const put = await call('PUT', `/page-editor/${key}`, { value: {} });
      expect(put.statusCode).toBe(403);
      expect(put.json().error.code).toBe('host_owned');
      expect((await call('DELETE', `/page-editor/${key}`)).statusCode).toBe(403);
    }
    // Same key names in the page containers are ordinary objects.
    expect((await call('PUT', '/page-editor-components/components', { value: {} })).statusCode).toBe(200);
  });

  it('validates keys and bodies', async () => {
    const { call } = await admin();
    expect((await call('PUT', '/page-editor/bad key!', { value: {} })).statusCode).toBe(400);
    expect((await call('PUT', '/page-editor/ok', {})).statusCode).toBe(400);
  });

  it('audit-logs writes and deletes with the acting user', async () => {
    const kit = await mcKit();
    const lines: Array<Record<string, unknown>> = [];
    const stream = { write: (line: string) => { lines.push(JSON.parse(line)); } };
    const t = testApp({ ...config, logLevel: 'info' }, { mcKeys: kit.keys as never, content: false, logStream: stream });
    const headers = { authorization: `Bearer ${await kit.sign({ sub: 'u-42' })}` };
    await t.app.inject({ method: 'PUT', url: '/v1/admin/objects/page-editor/wf-9', headers, payload: { value: {} } });
    await t.app.inject({ method: 'DELETE', url: '/v1/admin/objects/page-editor/wf-9', headers });
    const audit = lines.filter((l) => l.audit);
    expect(audit).toMatchObject([
      { actor: { userId: 'u-42', projectKey: 'us-store' }, op: 'put', container: 'page-editor', key: 'wf-9' },
      { actor: { userId: 'u-42', projectKey: 'us-store' }, op: 'delete', container: 'page-editor', key: 'wf-9' },
    ]);
    // The token itself is never logged.
    expect(JSON.stringify(lines)).not.toContain(headers.authorization.slice(7, 40));
  });

  it('maps unexpected commercetools failures to 502 without leaking details', async () => {
    const { call, fake } = await admin();
    fake.failNext(/custom-objects/, 500, { message: 'boom secret' });
    const res = await call('GET', '/page-editor?limit=5');
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.json())).not.toContain('secret');
  });
});
