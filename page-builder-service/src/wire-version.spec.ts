import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { SUPPORTED_WIRE_VERSIONS, WIRE_VERSION, requireWireVersion } from './wire-version.js';

let app: FastifyInstance | undefined;

function server(): FastifyInstance {
  app = Fastify();
  app.get('/render', { preHandler: requireWireVersion }, async () => ({ ok: true }));
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (headers: Record<string, string> = {}) =>
  server().inject({ method: 'GET', url: '/render', headers });

describe('requireWireVersion', () => {
  it('serves the current wire version', async () => {
    const res = await get({ 'x-pb-wire-version': String(WIRE_VERSION) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('rejects a missing header with 400 and the supported list', async () => {
    const res = await get();
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'wire_version_required',
        message: expect.stringContaining('x-pb-wire-version header is required'),
      },
      supported: SUPPORTED_WIRE_VERSIONS,
    });
  });

  it('rejects an empty header like a missing one', async () => {
    expect((await get({ 'x-pb-wire-version': '' })).statusCode).toBe(400);
  });

  it.each(['2', '0', 'one', '1.5', '-1', '1, 1'])('rejects %j with 426 naming supported versions', async (v) => {
    const res = await get({ 'x-pb-wire-version': v });
    expect(res.statusCode).toBe(426);
    expect(res.json()).toMatchObject({
      error: { code: 'wire_version_unsupported' },
      supported: SUPPORTED_WIRE_VERSIONS,
    });
  });
});
