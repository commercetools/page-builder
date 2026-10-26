import { createForwardRequest } from './forward-to';

import { executeHttpClientRequest } from '@commercetools-frontend/application-shell';

jest.mock('@commercetools-frontend/application-shell', () => ({
  buildApiUrl: (endpoint: string) => `https://mc-api.test${endpoint}`,
  executeHttpClientRequest: jest.fn(),
}));

const execute = executeHttpClientRequest as jest.Mock;
const config = { origin: 'https://svc.example.com', basePath: '/service' };

/** Run the fetcher the request hands to the shell with the options the shell would supply. */
function run(fetchImpl: jest.Mock) {
  execute.mockImplementation(
    async (fetcher) =>
      (
        await fetcher({
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Project-Key': 'proj',
            'X-Forward-To': 'set-by-shell',
          },
        })
      ).data
  );
  global.fetch = fetchImpl as never;
}

const reply = (status: number, body: unknown) =>
  jest.fn(async () => ({
    status,
    text: async () =>
      body === undefined
        ? ''
        : typeof body === 'string'
        ? body
        : JSON.stringify(body),
    headers: { get: () => null },
  }));

describe('createForwardRequest', () => {
  beforeEach(() => execute.mockReset());

  it('forwards through /proxy/forward-to with the origin audience policy and the full target URL', async () => {
    run(reply(200, { ok: true }));
    const result = await createForwardRequest(config)({
      method: 'GET',
      path: '/v1/admin/objects/page-editor/k',
      query: { where: 'id in ("a")', limit: 5, skipped: undefined },
    });

    expect(result).toEqual({ status: 200, json: { ok: true } });
    expect(execute.mock.calls[0][1]).toEqual({
      forwardToConfig: {
        uri: 'https://svc.example.com/service/v1/admin/objects/page-editor/k?where=id+in+%28%22a%22%29&limit=5',
        audiencePolicy: 'forward-url-origin',
      },
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://mc-api.test/proxy/forward-to');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      body: undefined,
    });
    expect(init.headers).toMatchObject({ 'X-Project-Key': 'proj' });
    expect(init.headers).not.toHaveProperty('content-type');
  });

  it('sends a JSON body with its content type', async () => {
    run(reply(200, {}));
    await createForwardRequest(config)({
      method: 'PUT',
      path: '/v1/admin/objects/c/k',
      body: { value: { a: 1 }, version: 2 },
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toBe('{"value":{"a":1},"version":2}');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('hands back non-2xx statuses for the link to interpret', async () => {
    run(reply(409, { error: { code: 'conflict' } }));
    expect(
      await createForwardRequest(config)({
        method: 'PUT',
        path: '/p',
        body: { value: 1 },
      })
    ).toEqual({
      status: 409,
      json: { error: { code: 'conflict' } },
    });
  });

  it('tolerates empty and non-JSON responses', async () => {
    run(reply(204, undefined));
    expect(
      await createForwardRequest(config)({ method: 'DELETE', path: '/p' })
    ).toEqual({ status: 204, json: undefined });
    run(reply(502, '<html>bad gateway</html>'));
    expect(
      await createForwardRequest(config)({ method: 'GET', path: '/p' })
    ).toEqual({ status: 502, json: undefined });
  });

  it('works for a service with no path prefix', async () => {
    run(reply(200, {}));
    await createForwardRequest({
      origin: 'https://svc.example.com',
      basePath: '',
    })({ method: 'GET', path: '/v1/admin/objects/c' });
    expect(execute.mock.calls[0][1].forwardToConfig.uri).toBe(
      'https://svc.example.com/v1/admin/objects/c'
    );
  });

  it('exposes response headers to the shell so a refreshed session token is kept', async () => {
    let getHeader: ((name: string) => string | null) | undefined;
    execute.mockImplementation(async (fetcher) => {
      const out = await fetcher({ credentials: 'include', headers: {} });
      getHeader = out.getHeader;
      return out.data;
    });
    global.fetch = jest.fn(async () => ({
      status: 200,
      text: async () => '{}',
      headers: {
        get: (n: string) => (n === 'x-refreshed-session-token' ? 'tok' : null),
      },
    })) as never;
    await createForwardRequest(config)({ method: 'GET', path: '/p' });
    expect(getHeader!('x-refreshed-session-token')).toBe('tok');
  });
});
