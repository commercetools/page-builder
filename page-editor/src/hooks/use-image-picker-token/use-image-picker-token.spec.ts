import { rest } from 'msw';
import { isTokenExpired, useImagePickerToken } from './use-image-picker-token';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import { failOperation, installMockServer } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const CONTAINER = 'contentools-configuration';
const KEY = 'contentools-jwt-token';
const BASE_URL = 'https://media.example.test';

/** A JWT whose payload expires `secondsFromNow` from now. Signature is irrelevant here. */
const jwt = (secondsFromNow: number, extra: Record<string, unknown> = {}) => {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + secondsFromNow,
    ...extra,
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
};

const FRESH = () => jwt(60 * 60);
const EXPIRING_SOON = () => jwt(60); // inside the 5-minute skew

const seedToken = (token: string) =>
  store.seed({ container: CONTAINER, key: KEY, value: token })[0];

const refreshReturns = (token: string) =>
  server.use(
    rest.post(`${BASE_URL}/refresh-jwt`, (_req, res, ctx) =>
      res(ctx.json({ token }))
    )
  );

const refreshFails = (status = 500, body = 'nope') =>
  server.use(
    rest.post(`${BASE_URL}/refresh-jwt`, (_req, res, ctx) =>
      res(ctx.status(status), ctx.text(body))
    )
  );

describe('isTokenExpired', () => {
  it('treats a missing token as expired', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
    expect(isTokenExpired('')).toBe(true);
  });

  it('treats an unparseable token as expired', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
    expect(isTokenExpired('a.!!!.c')).toBe(true);
  });

  it('treats a token with no exp claim as expired', () => {
    expect(isTokenExpired(`header.${btoa(JSON.stringify({}))}.sig`)).toBe(true);
  });

  it('accepts a token well inside its lifetime', () => {
    expect(isTokenExpired(FRESH())).toBe(false);
  });

  it('treats a token inside the refresh skew as already expired', () => {
    // Erring towards "expired": a needless refresh is cheap, a rejected upload is not.
    expect(isTokenExpired(EXPIRING_SOON())).toBe(true);
  });

  it('treats a past exp as expired', () => {
    expect(isTokenExpired(jwt(-60))).toBe(true);
  });
});

describe('useImagePickerToken', () => {
  // Note: a default parameter would be bypassed by an explicit `undefined`,
  // which is exactly the case the first test needs to exercise.
  const render = (...args: [] | [string | undefined]) => {
    const baseUrl = args.length === 0 ? BASE_URL : args[0];
    return renderHookWithProviders(() => useImagePickerToken(baseUrl));
  };

  it('reads nothing without a configured base URL', async () => {
    seedToken(FRESH());
    const { result } = render(undefined);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.token).toBeNull();
  });

  it('returns a usable stored token', async () => {
    const token = FRESH();
    seedToken(token);

    const { result } = render();
    await waitFor(() => expect(result.current.token).toBe(token));
    expect(result.current.refreshing).toBe(false);
  });

  it('degrades to no token when the custom object is absent', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Browse-only is a valid state; only uploads need the token.
    expect(result.current.token).toBeNull();
  });

  it('trades an expiring token for a fresh one', async () => {
    seedToken(EXPIRING_SOON());
    const fresh = FRESH();
    refreshReturns(fresh);

    const { result } = render();
    await waitFor(() => expect(result.current.token).toBe(fresh));
  });

  it('writes the refreshed token back for the next session', async () => {
    seedToken(EXPIRING_SOON());
    const fresh = FRESH();
    refreshReturns(fresh);

    const { result } = render();
    await waitFor(() => expect(result.current.token).toBe(fresh));
    await waitFor(() => expect(store.get(CONTAINER, KEY)?.value).toBe(fresh));
  });

  it('sends the expired token as the bearer credential', async () => {
    const expiring = EXPIRING_SOON();
    seedToken(expiring);
    const seen: string[] = [];
    server.use(
      rest.post(`${BASE_URL}/refresh-jwt`, (req, res, ctx) => {
        seen.push(req.headers.get('authorization') ?? '');
        return res(ctx.json({ token: FRESH() }));
      })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.token).not.toBeNull());
    expect(seen[0]).toBe(`Bearer ${expiring}`);
  });

  it('tolerates a trailing slash on the base URL', async () => {
    seedToken(EXPIRING_SOON());
    const fresh = FRESH();
    refreshReturns(fresh);

    const { result } = renderHookWithProviders(() =>
      useImagePickerToken(`${BASE_URL}/`)
    );
    await waitFor(() => expect(result.current.token).toBe(fresh));
  });

  it('degrades quietly when the refresh call fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedToken(EXPIRING_SOON());
    refreshFails();

    const { result } = render();
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        '[image-picker] token refresh failed',
        expect.any(Error)
      )
    );
    expect(result.current.token).toBeNull();
    warn.mockRestore();
  });

  it('degrades quietly when the refresh response carries no token', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedToken(EXPIRING_SOON());
    server.use(
      rest.post(`${BASE_URL}/refresh-jwt`, (_req, res, ctx) =>
        res(ctx.json({}))
      )
    );

    const { result } = render();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(result.current.token).toBeNull();
    warn.mockRestore();
  });

  it('still uses a refreshed token that could not be persisted', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedToken(EXPIRING_SOON());
    const fresh = FRESH();
    refreshReturns(fresh);
    // Fail only the write-back; the read already resolved.
    server.use(
      failOperation('UpsertImagePickerToken', 'version conflict', 'mutation')
    );

    const { result } = render();
    await waitFor(() => expect(result.current.token).toBe(fresh));
    warn.mockRestore();
  });

  it('refreshes once per stored value, not once per render', async () => {
    seedToken(EXPIRING_SOON());
    let calls = 0;
    server.use(
      rest.post(`${BASE_URL}/refresh-jwt`, (_req, res, ctx) => {
        calls += 1;
        return res(ctx.json({ token: FRESH() }));
      })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.token).not.toBeNull());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(calls).toBe(1);
  });
});
