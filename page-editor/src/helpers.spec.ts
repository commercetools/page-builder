import { ApolloError } from '@apollo/client';
import { extractErrorFromGraphQlResponse, mapWithConcurrency } from './helpers';

describe('extractErrorFromGraphQlResponse', () => {
  it('returns non-Error input untouched', () => {
    expect(extractErrorFromGraphQlResponse('nope')).toBe('nope');
    expect(extractErrorFromGraphQlResponse(null)).toBeNull();
  });

  it('returns a plain Error untouched — only Apollo errors are unwrapped', () => {
    const err = new Error('plain');
    expect(extractErrorFromGraphQlResponse(err)).toBe(err);
  });

  it('prefers the errors carried on a server networkError', () => {
    const serverErrors = [{ message: 'from the server' }];
    const error = new ApolloError({
      networkError: Object.assign(new Error('500'), {
        result: { errors: serverErrors },
        statusCode: 500,
        response: {} as Response,
      }),
    });
    expect(extractErrorFromGraphQlResponse(error)).toBe(serverErrors);
  });

  it('falls back to graphQLErrors when the networkError carries none', () => {
    const error = new ApolloError({
      graphQLErrors: [{ message: 'bad field' } as never],
    });
    expect(extractErrorFromGraphQlResponse(error)).toEqual([
      { message: 'bad field' },
    ]);
  });

  it('returns the ApolloError itself when it carries neither', () => {
    const error = new ApolloError({});
    expect(extractErrorFromGraphQlResponse(error)).toBe(error);
  });

  it('ignores a networkError whose result is a string', () => {
    const error = new ApolloError({
      networkError: Object.assign(new Error('502'), {
        result: 'Bad Gateway',
        statusCode: 502,
        response: {} as Response,
      }),
      graphQLErrors: [{ message: 'fallback' } as never],
    });
    expect(extractErrorFromGraphQlResponse(error)).toEqual([
      { message: 'fallback' },
    ]);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 0, 15, 5];
    const result = await mapWithConcurrency(delays, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('passes both the item and its index', async () => {
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(['a', 'b'], 1, async (item, index) => {
      seen.push([item, index]);
    });
    expect(seen).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(peak).toBe(3);
  });

  it('spawns no more workers than there are items', async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency(['only'], 8, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(peak).toBe(1);
  });

  it('returns an empty array for no items, without calling fn', async () => {
    const fn = jest.fn();
    expect(await mapWithConcurrency([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('propagates a rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('item 2 failed');
        return n;
      })
    ).rejects.toThrow('item 2 failed');
  });
});
