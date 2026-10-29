import { createDirectRequest } from './direct';

const config = { origin: 'http://localhost:8080', basePath: '/service' };
const TOKEN = 'dev-editor-token-1234';

const reply = (status: number, body: unknown) =>
  jest.fn(async () => ({
    status,
    text: async () =>
      body === undefined
        ? ''
        : typeof body === 'string'
        ? body
        : JSON.stringify(body),
  }));

type Init = RequestInit & { headers: Record<string, string> };
const lastCall = () => {
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [URL, Init];
  return { url: url.toString(), init };
};

describe('createDirectRequest', () => {
  it('calls the service itself with the token, and no credentials of the page', async () => {
    global.fetch = reply(200, { ok: true }) as never;
    const result = await createDirectRequest(
      config,
      TOKEN
    )({
      method: 'GET',
      path: '/v1/admin/objects/page-editor/k',
      query: { where: 'id in ("a")', limit: 5, skipped: undefined },
    });

    expect(result).toEqual({ status: 200, json: { ok: true } });
    const { url, init } = lastCall();
    expect(url).toBe(
      'http://localhost:8080/service/v1/admin/objects/page-editor/k?where=id+in+%28%22a%22%29&limit=5'
    );
    expect(init).toMatchObject({ method: 'GET', body: undefined });
    expect(init.headers).toEqual({
      accept: 'application/json',
      authorization: `Bearer ${TOKEN}`,
    });
    // A cross-origin call that sends cookies would need the service to allow credentials; it does not.
    expect(init).not.toHaveProperty('credentials');
  });

  it('sends a JSON body with its content type', async () => {
    global.fetch = reply(200, {}) as never;
    await createDirectRequest(
      config,
      TOKEN
    )({
      method: 'PUT',
      path: '/v1/admin/objects/c/k',
      body: { value: { a: 1 }, version: 2 },
    });
    const { init } = lastCall();
    expect(init.body).toBe('{"value":{"a":1},"version":2}');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('sends a FormData body as it is, leaving the content type to the browser', async () => {
    global.fetch = reply(201, { key: 'k' }) as never;
    const body = new FormData();
    body.append('file', new File(['x'], 'a.png', { type: 'image/png' }));

    const result = await createDirectRequest(
      config,
      TOKEN
    )({ method: 'POST', path: '/v1/admin/media', body });

    expect(result).toEqual({ status: 201, json: { key: 'k' } });
    const { url, init } = lastCall();
    expect(url).toBe('http://localhost:8080/service/v1/admin/media');
    expect(init.body).toBe(body);
    expect(Object.keys(init.headers)).not.toContain('content-type');
  });

  it('hands back non-2xx statuses, and tolerates empty and non-JSON replies', async () => {
    const request = createDirectRequest(config, TOKEN);
    global.fetch = reply(409, { error: { code: 'conflict' } }) as never;
    expect(
      await request({ method: 'PUT', path: '/p', body: { value: 1 } })
    ).toEqual({ status: 409, json: { error: { code: 'conflict' } } });
    global.fetch = reply(204, undefined) as never;
    expect(await request({ method: 'DELETE', path: '/p' })).toEqual({
      status: 204,
      json: undefined,
    });
    global.fetch = reply(502, '<html>bad gateway</html>') as never;
    expect(await request({ method: 'GET', path: '/p' })).toEqual({
      status: 502,
      json: undefined,
    });
  });

  it('says what to check when the browser cannot reach the service, without the token', async () => {
    const cause = new TypeError('Failed to fetch');
    global.fetch = jest.fn(async () => {
      throw cause;
    }) as never;
    const failure = await createDirectRequest(
      config,
      TOKEN
    )({ method: 'GET', path: '/p' }).catch((e: Error) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /http:\/\/localhost:8080\/service directly.*PB_DEV_TOKEN.*PB_EDITOR_ORIGINS/
    );
    expect((failure as Error).message).not.toContain(TOKEN);
    expect((failure as Error).cause).toBe(cause);
  });

  it('works for a service with no path prefix', async () => {
    global.fetch = reply(200, {}) as never;
    await createDirectRequest(
      { origin: 'http://localhost:8080', basePath: '' },
      TOKEN
    )({ method: 'GET', path: '/v1/admin/objects/c' });
    expect(lastCall().url).toBe('http://localhost:8080/v1/admin/objects/c');
  });
});
