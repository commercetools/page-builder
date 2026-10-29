import { describe, expect, it } from 'vitest';
import { testApp } from './testing/fixtures.js';
import { AUDIENCE, ISSUER, mcKit } from './testing/mc-kit.js';

const config = { mc: { issuer: ISSUER, audience: AUDIENCE } };
const ABSENT = '/v1/admin/objects/page-editor/nope';

describe('mcAuth', () => {
  it('rejects a request without a token', async () => {
    const t = testApp(config, { mcKeys: (await mcKit()).keys as never });
    const res = await t.app.inject({ method: 'GET', url: ABSENT });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('missing_token');
  });

  it('rejects garbage', async () => {
    const t = testApp(config, { mcKeys: (await mcKit()).keys as never });
    const res = await t.app.inject({ method: 'GET', url: ABSENT, headers: { authorization: 'Bearer not-a-jwt' } });
    expect(res.json().error.code).toBe('invalid_token');
  });

  it('accepts a valid token (404 just means authenticated and the object is absent)', async () => {
    const kit = await mcKit();
    const t = testApp(config, { mcKeys: kit.keys as never });
    const res = await t.app.inject({ method: 'GET', url: '/v1/admin/objects/page-editor/nope', headers: { authorization: `Bearer ${await kit.sign()}` } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  const bad: Array<[string, (k: Awaited<ReturnType<typeof mcKit>>) => Promise<string>]> = [
    ['a signature from another key', async (k) => k.sign({ key: k.other.privateKey })],
    ['the wrong issuer', async (k) => k.sign({ issuer: 'https://evil.test' })],
    ['the wrong audience', async (k) => k.sign({ audience: 'https://other.test' })],
    ['an expired token', async (k) => k.sign({ expires: '-1m' })],
    ['a missing subject', async (k) => k.sign({ sub: null })],
    ['another project', async (k) => k.sign({ claims: { [`${ISSUER}/claims/project_key`]: 'someone-elses' } })],
    ['a missing project claim', async (k) => k.sign({ claims: { [`${ISSUER}/claims/project_key`]: undefined } })],
    ['a non-RS256 algorithm', async () => 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'],
  ];
  for (const [label, make] of bad) {
    it(`rejects ${label}`, async () => {
      const kit = await mcKit();
      const t = testApp(config, { mcKeys: kit.keys as never });
      const res = await t.app.inject({ method: 'GET', url: '/v1/admin/objects/page-editor/nope', headers: { authorization: `Bearer ${await make(kit)}` } });
      expect(res.statusCode).toBe(401);
    });
  }
});

describe('development token', () => {
  const token = 'dev-editor-token-1234';
  const url = '/v1/admin/objects/page-editor/nope';
  const withToken = { devToken: token };

  it('opens the admin API without Merchant Center sign-in configured', async () => {
    const t = testApp(withToken);
    const res = await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('rejects a missing or different token', async () => {
    const t = testApp(withToken);
    const missing = await t.app.inject({ method: 'GET', url });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('missing_token');
    for (const presented of ['nope', `${token}x`, token.slice(0, -1)]) {
      const res = await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${presented}` } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('invalid_token');
    }
  });

  it('is not accepted by a service that has no token configured', async () => {
    const t = testApp({});
    const res = await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(503);
  });

  it('leaves the Merchant Center JWT working beside it, and rejects anything else', async () => {
    const kit = await mcKit();
    const t = testApp({ ...config, ...withToken }, { mcKeys: kit.keys as never });
    const jwt = await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${await kit.sign()}` } });
    expect(jwt.statusCode).toBe(404);
    const dev = await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
    expect(dev.statusCode).toBe(404);
    const wrong = await t.app.inject({ method: 'GET', url, headers: { authorization: 'Bearer not-a-jwt' } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('invalid_token');
    expect((await t.app.inject({ method: 'GET', url })).json().error.code).toBe('missing_token');
  });

  it('audit-logs writes as the local developer, never the token', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const logStream = { write: (line: string) => { lines.push(JSON.parse(line)); } };
    const t = testApp({ ...withToken, logLevel: 'info' }, { content: false, logStream });
    await t.app.inject({
      method: 'PUT',
      url: '/v1/admin/objects/page-editor/wf-9',
      headers: { authorization: `Bearer ${token}` },
      payload: { value: {} },
    });
    expect(lines.filter((l) => l.audit)).toMatchObject([{ actor: { userId: 'local-dev', projectKey: 'us-store' }, op: 'put' }]);
    expect(JSON.stringify(lines)).not.toContain(token);
  });
});
