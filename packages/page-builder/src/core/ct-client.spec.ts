import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchToken,
  getCustomObject,
  getCustomObjectsByIds,
  listCustomObjects,
  putCustomObject,
} from './ct-client.js';
import { buildCtEnv } from '../test-utils/factories.js';

/**
 * Driven against a real loopback HTTP server rather than a mocked `node:https`.
 * The client is a hand-rolled request layer — status handling, pagination and
 * chunking are the behaviour worth testing, and stubbing the transport would
 * skip exactly that.
 */
type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

let server: Server;
let baseUrl: string;
let handler: Handler;
let requests: Array<{ method: string; url: string; body: string; auth?: string }>;

beforeEach(async () => {
  requests = [];
  handler = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  };

  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body,
        auth: req.headers.authorization,
      });
      handler(req, res, body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const env = () => buildCtEnv({ authUrl: baseUrl, apiUrl: baseUrl });

const respondJson = (payload: unknown, status = 200) => {
  handler = (_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
};

const respondStatus = (status: number, body = '') => {
  handler = (_req, res) => {
    res.writeHead(status);
    res.end(body);
  };
};

const co = (key: string, over: Record<string, unknown> = {}) => ({
  id: `co-${key}`,
  version: 1,
  container: 'page-editor',
  key,
  value: { hello: key },
  ...over,
});

describe('fetchToken', () => {
  it('exchanges client credentials for an access token', async () => {
    respondJson({ access_token: 'tok-123' });
    expect(await fetchToken(env())).toBe('tok-123');
  });

  it('posts to the oauth endpoint with basic auth and the configured scopes', async () => {
    respondJson({ access_token: 'tok-123' });
    await fetchToken(
      buildCtEnv({
        authUrl: baseUrl,
        apiUrl: baseUrl,
        scopes: 'manage_key_value_documents:test-project',
      })
    );

    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/oauth/token');
    expect(request.auth).toMatch(/^Basic /);
    expect(
      Buffer.from(request.auth!.replace('Basic ', ''), 'base64').toString()
    ).toBe('test-client-id:test-secret-value');
    expect(request.body).toContain('grant_type=client_credentials');
  });

  it('percent-encodes the scope list', async () => {
    respondJson({ access_token: 'tok' });
    await fetchToken(buildCtEnv({ authUrl: baseUrl, apiUrl: baseUrl, scopes: 'a:b c:d' }));
    expect(requests[0].body).toContain('scope=a%3Ab%20c%3Ad');
  });

  it('rejects when the auth server refuses', async () => {
    respondStatus(401, 'invalid_client');
    await expect(fetchToken(env())).rejects.toThrow();
  });
});

describe('getCustomObject', () => {
  it('reads an object by container and key', async () => {
    respondJson(co('sections'));
    const result = await getCustomObject(env(), 'tok', 'sections');

    expect(result?.key).toBe('sections');
    expect(requests[0].url).toBe('/test-project/custom-objects/page-editor/sections');
    expect(requests[0].auth).toBe('Bearer tok');
  });

  it('honours a non-default container', async () => {
    respondJson(co('page-home'));
    await getCustomObject(env(), 'tok', 'page-home', 'page-editor-draft');
    expect(requests[0].url).toContain('/custom-objects/page-editor-draft/page-home');
  });

  it('reports a missing object as null rather than throwing', async () => {
    respondStatus(404, 'not found');
    expect(await getCustomObject(env(), 'tok', 'nope')).toBeNull();
  });

  it('still throws for any other error status', async () => {
    respondStatus(500, 'boom');
    await expect(getCustomObject(env(), 'tok', 'sections')).rejects.toThrow();
  });
});

describe('listCustomObjects', () => {
  it('returns everything in one page when it fits', async () => {
    respondJson({ results: [co('a'), co('b')], total: 2 });
    const results = await listCustomObjects(env(), 'tok');

    expect(results.map((r) => r.key)).toEqual(['a', 'b']);
    expect(requests).toHaveLength(1);
  });

  it('pages until it has read the reported total', async () => {
    let call = 0;
    handler = (_req, res) => {
      call += 1;
      const page =
        call === 1
          ? { results: Array.from({ length: 500 }, (_, i) => co(`a${i}`)), total: 501 }
          : { results: [co('last')], total: 501 };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(page));
    };

    const results = await listCustomObjects(env(), 'tok');
    expect(results).toHaveLength(501);
    expect(requests).toHaveLength(2);
    expect(requests[1].url).toContain('offset=500');
  });

  it('stops on an empty container', async () => {
    respondJson({ results: [], total: 0 });
    expect(await listCustomObjects(env(), 'tok')).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});

describe('getCustomObjectsByIds', () => {
  it('makes no request at all for an empty id list', async () => {
    expect(await getCustomObjectsByIds(env(), 'tok', [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('builds an `id in (...)` predicate sized to the chunk', async () => {
    respondJson({ results: [co('a')] });
    await getCustomObjectsByIds(env(), 'tok', ['co-1', 'co-2']);

    const url = decodeURIComponent(requests[0].url);
    expect(url).toContain('id in ("co-1", "co-2")');
    expect(requests[0].url).toContain('limit=2');
  });

  it('chunks a large id list so the URL stays within limits', async () => {
    respondJson({ results: [] });
    await getCustomObjectsByIds(
      env(),
      'tok',
      Array.from({ length: 250 }, (_, i) => `co-${i}`)
    );
    // 100 per chunk → three requests.
    expect(requests).toHaveLength(3);
  });

  it('concatenates the results across chunks', async () => {
    let call = 0;
    handler = (_req, res) => {
      call += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [co(`chunk-${call}`)] }));
    };

    const results = await getCustomObjectsByIds(
      env(),
      'tok',
      Array.from({ length: 150 }, (_, i) => `co-${i}`)
    );
    expect(results.map((r) => r.key)).toEqual(['chunk-1', 'chunk-2']);
  });
});

describe('putCustomObject', () => {
  it('posts the draft to the custom-objects endpoint', async () => {
    respondJson(co('sections', { version: 2 }));
    const result = await putCustomObject(env(), 'tok', 'sections', { a: 1 }, undefined);

    expect(result.version).toBe(2);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/test-project/custom-objects');
    expect(JSON.parse(requests[0].body)).toEqual({
      container: 'page-editor',
      key: 'sections',
      value: { a: 1 },
    });
  });

  it('sends the version so CT can reject a stale write', async () => {
    respondJson(co('sections'));
    await putCustomObject(env(), 'tok', 'sections', { a: 1 }, 3);
    expect(JSON.parse(requests[0].body).version).toBe(3);
  });

  it('omits the version entirely for a blind upsert', async () => {
    respondJson(co('sections'));
    await putCustomObject(env(), 'tok', 'sections', { a: 1 }, undefined);
    expect('version' in JSON.parse(requests[0].body)).toBe(false);
  });

  it('sends version 0, which is meaningful, rather than dropping it', async () => {
    respondJson(co('sections'));
    await putCustomObject(env(), 'tok', 'sections', { a: 1 }, 0);
    expect(JSON.parse(requests[0].body).version).toBe(0);
  });

  it('writes to a non-default container', async () => {
    respondJson(co('page-home'));
    await putCustomObject(
      env(),
      'tok',
      'page-home',
      { a: 1 },
      undefined,
      'page-editor-draft'
    );
    expect(JSON.parse(requests[0].body).container).toBe('page-editor-draft');
  });

  it('rejects a conflicting write', async () => {
    respondStatus(409, 'version mismatch');
    await expect(
      putCustomObject(env(), 'tok', 'sections', { a: 1 }, 1)
    ).rejects.toThrow();
  });
});
