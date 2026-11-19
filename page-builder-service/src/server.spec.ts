import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

let app: FastifyInstance | undefined;

function server(basePath = ''): FastifyInstance {
  app = buildServer({ ...loadConfig({}), basePath, logLevel: 'silent' });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('server', () => {
  it('serves a health check', async () => {
    const res = await server().inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('serves the conventional /status liveness route alongside /healthz', async () => {
    const res = await server().inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect((await server('/service').inject({ method: 'GET', url: '/service/status' })).statusCode).toBe(200);
  });

  it('mounts routes under the base path only', async () => {
    const s = server('/service');
    expect((await s.inject({ method: 'GET', url: '/service/healthz' })).statusCode).toBe(200);
    expect((await s.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(404);
  });

  it('returns the shared error shape for unknown routes', async () => {
    const res = await server().inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });

  it('echoes a caller-supplied request id', async () => {
    const res = await server().inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('generates a request id when none is supplied or it is oversized', async () => {
    const a = await server().inject({ method: 'GET', url: '/healthz' });
    expect(a.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const b = await app!.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'x'.repeat(200) },
    });
    expect(b.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hides internals of server faults but reports client errors', async () => {
    const s = server();
    s.get('/boom', async () => {
      throw new Error('secret detail');
    });
    s.get('/bad', async () => {
      throw Object.assign(new Error('nope'), { statusCode: 400 });
    });
    const boom = await s.inject({ method: 'GET', url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.json()).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
    const bad = await s.inject({ method: 'GET', url: '/bad' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: { code: 'bad_request', message: 'nope' } });
  });
});
